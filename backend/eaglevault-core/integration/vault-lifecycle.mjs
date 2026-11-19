import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { EagleVaultClient, EagleVaultApiError } from '../../../web/src/api/eaglevault-client.ts';
import { loginToEagleVault, registerEagleVaultAccount } from '../../../web/src/auth/eaglevault-auth.ts';
import { BitwardenCryptoProvider } from '../../../web/src/crypto/bitwarden-crypto.ts';

const cryptoProvider = new BitwardenCryptoProvider();
const password = 'Synthetic EagleVault integration fixture only';
const runtime = new Miniflare({
  modules: true,
  scriptPath: fileURLToPath(new URL('../src/index.mjs', import.meta.url)),
  compatibilityDate: '2026-08-06',
  bindings: {
    CORS_ORIGINS: 'https://eaglevault.eaglenet.asia',
    REGISTRATION_ENABLED: 'true',
  },
  durableObjects: {
    VAULTS: { className: 'VaultStore', useSQLite: true },
    RATE_LIMITS: { className: 'RateLimitStore', useSQLite: true },
  },
});

const requestBodies = [];
let rejectOneSync = false;
let lastAccessToken = '';
const fetchImpl = async (input, init) => {
  const url = new URL(String(input));
  const body = typeof init?.body === 'string' ? init.body : '';
  requestBodies.push(body);
  if (rejectOneSync && url.pathname === '/v1/vault/sync') {
    rejectOneSync = false;
    return Response.json({ error: 'invalid_or_expired_token' }, { status: 401 });
  }
  const response = await runtime.dispatchFetch(url.toString(), init);
  if (url.pathname === '/v1/auth/login' || url.pathname === '/v1/auth/refresh') {
    lastAccessToken = (await response.clone().json()).access_token;
  }
  return response;
};

function createClient() {
  return new EagleVaultClient('https://api.example.test', fetchImpl);
}

try {
  const email = `lifecycle-${crypto.randomUUID()}@example.test`;
  const session = await registerEagleVaultAccount(createClient(), email, password, cryptoProvider);
  const keyCheck = await session.client.discoverKdf(email);
  assert.equal(keyCheck.kdf.type, 'pbkdf2-sha256');
  assert.equal(session.userKey.byteLength, 64);

  const duplicateClient = createClient();
  await assert.rejects(
    registerEagleVaultAccount(duplicateClient, email.toUpperCase(), password, cryptoProvider),
    (error) => error instanceof EagleVaultApiError && error.status === 409,
  );
  const wrongPasswordClient = createClient();
  await assert.rejects(
    loginToEagleVault(wrongPasswordClient, email, 'Incorrect synthetic password', cryptoProvider),
    (error) => error instanceof EagleVaultApiError && error.status === 401,
  );

  const firstPlaintext = JSON.stringify({
    type: 'login',
    name: 'synthetic-service',
    username: 'test-user',
    password: 'Never use real credentials',
    website: 'https://example.test',
    notes: '',
    folderId: '',
  });
  const firstCiphertext = cryptoProvider.encryptString(firstPlaintext, session.userKey);
  assert.equal(firstCiphertext.includes('Never use real credentials'), false);

  assert.equal(await session.client.writeRecord('item', 'login-1', 0, firstCiphertext), 1);
  await assert.rejects(
    session.client.writeRecord('item', 'login-1', 0, firstCiphertext),
    (error) => error instanceof EagleVaultApiError && error.status === 409,
  );

  const pages = await session.client.sync();
  const initial = pages.flatMap((page) => page.records);
  assert.equal(initial.length, 1);
  assert.equal(initial[0].ciphertext?.includes('Never use real credentials'), false);
  assert.deepEqual(
    JSON.parse(cryptoProvider.decryptString(initial[0].ciphertext, session.userKey)),
    JSON.parse(firstPlaintext),
  );

  const secondEmail = `isolated-${crypto.randomUUID()}@example.test`;
  const secondSession = await registerEagleVaultAccount(createClient(), secondEmail, password, cryptoProvider);
  assert.deepEqual((await secondSession.client.sync()).flatMap((page) => page.records), []);
  await secondSession.client.logout();
  secondSession.userKey.fill(0);

  const updatedCiphertext = cryptoProvider.encryptString(
    JSON.stringify({
      type: 'login',
      name: 'synthetic-service',
      username: 'changed-user',
      password: 'Changed fixture',
      website: 'https://example.test',
      notes: '',
      folderId: '',
    }),
    session.userKey,
  );
  assert.equal(await session.client.writeRecord('item', 'login-1', 1, updatedCiphertext), 2);

  rejectOneSync = true;
  const syncedAfterRefresh = await session.client.sync();
  const afterRefresh = syncedAfterRefresh.flatMap((page) => page.records);
  assert.equal(afterRefresh[0].revision, 2);

  const exported = await session.client.exportVault();
  assert.equal(exported.records.length, 1);
  assert.equal(JSON.stringify(exported).includes('Changed fixture'), false);

  assert.equal(await session.client.deleteRecord('item', 'login-1', 2), 3);
  const deleted = (await session.client.sync()).flatMap((page) => page.records);
  assert.equal(deleted[0].ciphertext, null);
  assert.equal(deleted[0].revision, 3);

  await session.client.logout();
  await assert.rejects(
    session.client.sync(),
    (error) => error instanceof EagleVaultApiError && error.status === 401,
  );
  const replay = await runtime.dispatchFetch('https://api.example.test/v1/vault/sync', {
    headers: { authorization: `Bearer ${lastAccessToken}` },
  });
  assert.equal(replay.status, 401);

  assert.equal(requestBodies.some((body) => body.includes(password)), false);
  assert.equal(requestBodies.some((body) => body.includes('Never use real credentials')), false);
  session.userKey.fill(0);
  console.log('Web/Core lifecycle passed: registration, unlock, encrypted CRUD, conflicts, sync, account isolation, refresh rotation, logout, and no plaintext request bodies');
} finally {
  await runtime.dispose();
}
