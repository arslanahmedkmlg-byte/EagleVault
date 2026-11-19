import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { BitwardenCryptoProvider } from '../../../web/src/crypto/bitwarden-crypto.ts';
const sdk = new BitwardenCryptoProvider();
const email = 'synthetic@example.test';
const password = 'Synthetic EagleVault registration fixture only';
const kdf = { type: 'pbkdf2-sha256', iterations: 600000 };
const master = sdk.deriveMasterKey(password, email, kdf);
const key = sdk.generateUserKey();
const authenticationHash = await sdk.deriveMasterPasswordAuthenticationHash(password, master);
const wrappedUserKey = sdk.encryptUserKeyWithMasterPassword(key, password, email, kdf);
assert.deepEqual(sdk.decryptUserKeyWithMasterPassword(wrappedUserKey, password, email, kdf), key);
const token = 'a'.repeat(64);
const stagingKey = 'synthetic-stage-key-for-workerd-integration';
const runtime = new Miniflare({
  modules: true,
  scriptPath: fileURLToPath(new URL('../src/index.mjs', import.meta.url)),
  compatibilityDate: '2026-08-06',
  bindings: {
    TEST_REGISTRATION_TOKEN: token,
    STAGING_MODE: 'true',
    STAGING_ACCESS_KEY: stagingKey,
  },
  durableObjects: {
    VAULTS: { className: 'VaultStore', useSQLite: true },
    RATE_LIMITS: { className: 'RateLimitStore', useSQLite: true },
  }
});
const request = (body, credential = token) => runtime.dispatchFetch('https://example.test/v1/accounts', {
  method: 'POST',
  headers: {
    authorization: 'Bearer ' + credential,
    'content-type': 'application/json',
    'x-eaglevault-staging-key': stagingKey,
  },
  body: JSON.stringify(body)
});
try {
  const body = { email, authenticationHash, wrappedUserKey };
  assert.equal((await request(body, 'bad')).status, 404);
  assert.equal((await request({ ...body, email: 'sample@example.com' })).status, 400);
  assert.equal((await request({ ...body, password })).status, 400);
  assert.equal((await request({ ...body, padding: 'x'.repeat(2048) })).status, 400);
  assert.equal((await request({ ...body, wrappedUserKey: '2.invalid' })).status, 400);
  const created = await request(body);
  assert.equal(created.status, 201, await created.text());
  assert.equal((await request({ ...body, email: ' SYNTHETIC@EXAMPLE.TEST ' })).status, 409);
  assert.equal((await request({ ...body, email: 'other@example.test' })).status, 201);
  console.log('Cloudflare workerd synthetic account creation, guards, duplicate handling and isolation passed');
} finally {
  master.fill(0);
  key.fill(0);
  await runtime.dispose();
}
