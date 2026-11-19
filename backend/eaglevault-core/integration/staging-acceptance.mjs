import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EagleVaultClient, EagleVaultApiError } from '../../../web/src/api/eaglevault-client.ts';
import { loginToEagleVault, registerEagleVaultAccount } from '../../../web/src/auth/eaglevault-auth.ts';
import { BitwardenCryptoProvider } from '../../../web/src/crypto/bitwarden-crypto.ts';

const apiOrigin = process.env.EAGLEVAULT_STAGING_API_URL;
const webOrigin = process.env.EAGLEVAULT_STAGING_WEB_URL;
assert.ok(apiOrigin && webOrigin, 'Set the staging Web and Core URLs.');

const apiUrl = new URL(apiOrigin);
const webUrl = new URL(webOrigin);
assert.equal(apiUrl.protocol, 'https:');
assert.equal(webUrl.protocol, 'https:');
assert.match(apiUrl.hostname, /^eaglevault-core-staging\..+\.workers\.dev$/);
assert.match(webUrl.hostname, /^eaglevault-web-staging\..+\.workers\.dev$/);
assert.equal(apiUrl.pathname, '/');
assert.equal(webUrl.pathname, '/');

const secrets = readFileSync(new URL('../../../secrets/staging.env', import.meta.url), 'utf8');
const accessKey = /^STAGING_ACCESS_KEY=([A-Za-z0-9_-]{43})$/m.exec(secrets)?.[1];
assert.ok(accessKey, 'The ignored staging secret file is missing or malformed.');

const basicAuthorization = `Basic ${Buffer.from(`staging:${accessKey}`).toString('base64')}`;
const apiHeaders = {
  origin: webOrigin,
  'x-eaglevault-staging-key': accessKey,
};

const staticDenied = await fetch(webOrigin, { redirect: 'manual' });
assert.equal(staticDenied.status, 401);
assert.match(staticDenied.headers.get('www-authenticate') ?? '', /Basic/);
assert.equal(staticDenied.headers.get('strict-transport-security'), 'max-age=31536000');
const staticResponse = await fetch(webOrigin, {
  headers: { authorization: basicAuthorization },
  redirect: 'manual',
});
assert.equal(staticResponse.status, 200);
assert.match(staticResponse.headers.get('content-security-policy') ?? '', new RegExp(apiUrl.hostname));
assert.equal(staticResponse.headers.get('x-content-type-options'), 'nosniff');
const html = await staticResponse.text();
const assetPaths = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"/g)]
  .map((match) => match[1])
  .filter((path) => !/^https?:\/\//i.test(path));
assert.ok(assetPaths.some((path) => /\.js(?:\?|$)/.test(path)), 'The app entry point was not delivered.');
for (const path of assetPaths) {
  const asset = await fetch(new URL(path, webUrl), {
    headers: { authorization: basicAuthorization },
    redirect: 'manual',
  });
  assert.equal(asset.status, 200);
}

const health = await fetch(`${apiOrigin}/health`);
assert.equal(health.status, 200);
assert.equal(health.headers.get('strict-transport-security'), 'max-age=31536000');
const deniedApi = await fetch(`${apiOrigin}/api/accounts/prelogin`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'blocked@example.test' }),
});
assert.equal(deniedApi.status, 401);
const preflight = await fetch(`${apiOrigin}/v1/vault/sync`, {
  method: 'OPTIONS',
  headers: {
    origin: webOrigin,
    'access-control-request-method': 'GET',
    'access-control-request-headers': 'authorization,content-type,x-eaglevault-staging-key',
  },
});
assert.equal(preflight.status, 204);
assert.equal(preflight.headers.get('access-control-allow-origin'), webOrigin);
assert.match(preflight.headers.get('access-control-allow-headers') ?? '', /x-eaglevault-staging-key/i);
const badOrigin = await fetch(`${apiOrigin}/health`, {
  headers: { origin: 'https://attacker.example' },
});
assert.equal(badOrigin.status, 403);

const cryptoProvider = new BitwardenCryptoProvider();
const password = `Synthetic staging password ${crypto.randomUUID()}`;
const requestBodies = [];
const capturedTokens = [];
let forceRefresh = false;
let refreshCount = 0;
const trackedFetch = async (input, init) => {
  const url = new URL(String(input));
  const headers = new Headers(init?.headers);
  headers.set('origin', webOrigin);
  const body = typeof init?.body === 'string' ? init.body : '';
  requestBodies.push(body);
  if (forceRefresh && url.pathname === '/v1/vault/sync') {
    forceRefresh = false;
    return Response.json({ error: 'invalid_or_expired_token' }, { status: 401 });
  }
  const response = await fetch(input, { ...init, headers });
  if (url.pathname === '/v1/auth/login' || url.pathname === '/v1/auth/refresh') {
    const tokens = await response.clone().json();
    capturedTokens.push(tokens);
    if (url.pathname === '/v1/auth/refresh') refreshCount++;
  }
  return response;
};

function createClient() {
  return new EagleVaultClient(apiOrigin, trackedFetch, accessKey);
}

const email = `staging-${crypto.randomUUID()}@example.test`;
const session = await registerEagleVaultAccount(createClient(), email, password, cryptoProvider);
const itemId = crypto.randomUUID().replaceAll('-', '');
const title = `Synthetic staging item ${crypto.randomUUID()}`;
const originalPassword = `Synthetic item secret ${crypto.randomUUID()}`;
const firstPlaintext = JSON.stringify({
  type: 'login',
  name: title,
  username: 'synthetic-user',
  password: originalPassword,
  website: 'https://example.test',
  notes: '',
  folderId: '',
});
const firstCiphertext = cryptoProvider.encryptString(firstPlaintext, session.userKey);
assert.equal(firstCiphertext.includes(originalPassword), false);
assert.equal(await session.client.writeRecord('item', itemId, 0, firstCiphertext), 1);

const secondClient = createClient();
const secondSession = await loginToEagleVault(secondClient, email, password, cryptoProvider);
const initialRecords = (await secondClient.sync()).flatMap((page) => page.records);
assert.equal(initialRecords.length, 1);
assert.equal(initialRecords[0].revision, 1);
assert.equal(initialRecords[0].ciphertext.includes(originalPassword), false);
assert.equal(
  JSON.parse(cryptoProvider.decryptString(initialRecords[0].ciphertext, secondSession.userKey)).password,
  originalPassword,
);

const editedPassword = `Edited synthetic item ${crypto.randomUUID()}`;
const editedPlaintext = JSON.stringify({
  type: 'login',
  name: title,
  username: 'edited-synthetic-user',
  password: editedPassword,
  website: 'https://example.test',
  notes: '',
  folderId: '',
});
const editedCiphertext = cryptoProvider.encryptString(editedPlaintext, secondSession.userKey);
assert.equal(await secondClient.writeRecord('item', itemId, 1, editedCiphertext), 2);
forceRefresh = true;
const updatedRecords = (await session.client.sync()).flatMap((page) => page.records);
assert.equal(updatedRecords[0].revision, 2);
assert.equal(
  JSON.parse(cryptoProvider.decryptString(updatedRecords[0].ciphertext, session.userKey)).password,
  editedPassword,
);
assert.equal(refreshCount, 1);
const exportedVault = await session.client.exportVault();
assert.equal(JSON.stringify(exportedVault).includes(originalPassword), false);
assert.equal(JSON.stringify(exportedVault).includes(editedPassword), false);

const oldRefreshToken = capturedTokens[0]?.refresh_token;
assert.ok(oldRefreshToken);
const replayedRefresh = await fetch(`${apiOrigin}/v1/auth/refresh`, {
  method: 'POST',
  headers: { ...apiHeaders, 'content-type': 'application/json' },
  body: JSON.stringify({ refresh_token: oldRefreshToken }),
});
assert.equal(replayedRefresh.status, 401);

assert.equal(await session.client.deleteRecord('item', itemId, 2), 3);
const deletedRecords = (await secondClient.sync()).flatMap((page) => page.records);
assert.equal(deletedRecords[0].revision, 3);
assert.equal(deletedRecords[0].ciphertext, null);

const secondAccessToken = capturedTokens[1]?.access_token;
assert.ok(secondAccessToken);
await secondClient.logout();
const revokedAccess = await fetch(`${apiOrigin}/v1/vault/sync`, {
  headers: { ...apiHeaders, authorization: `Bearer ${secondAccessToken}` },
});
assert.equal(revokedAccess.status, 401);
await session.client.logout();

const reauthenticated = createClient();
const relogin = await loginToEagleVault(reauthenticated, email, password, cryptoProvider);
const persistedDeletion = (await reauthenticated.sync()).flatMap((page) => page.records);
assert.equal(persistedDeletion.length, 1);
assert.equal(persistedDeletion[0].revision, 3);
assert.equal(persistedDeletion[0].ciphertext, null);
relogin.userKey.fill(0);

const isolatedEmail = `isolated-${crypto.randomUUID()}@example.test`;
const isolated = await registerEagleVaultAccount(createClient(), isolatedEmail, password, cryptoProvider);
assert.deepEqual((await isolated.client.sync()).flatMap((page) => page.records), []);
await isolated.client.logout();
isolated.userKey.fill(0);

assert.equal(requestBodies.some((body) => body.includes(password)), false);
assert.equal(requestBodies.some((body) => body.includes(originalPassword)), false);
assert.equal(requestBodies.some((body) => body.includes(editedPassword)), false);
assert.equal(requestBodies.some((body) => body.includes(title)), false);
assert.equal(requestBodies.some((body) => body.includes(accessKey)), false);
if (process.env.EAGLEVAULT_STAGING_LOG_FILE) {
  const logText = readFileSync(process.env.EAGLEVAULT_STAGING_LOG_FILE, 'utf8');
  for (const secret of [accessKey, password, originalPassword, editedPassword, title]) {
    assert.equal(logText.includes(secret), false);
  }
}
session.userKey.fill(0);
secondSession.userKey.fill(0);

console.log('STAGING_ACCEPTANCE_PASS: HTTPS, protected static assets, API access gate, CORS, security headers, registration, login/unlock, encrypted CRUD, sync, persistence, refresh rotation, replay rejection, logout revocation, account isolation, and no plaintext request bodies.');
