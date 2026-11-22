import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { AccountStore } from '../../backend/eaglevault-core/src/account-store.mjs';
import { checkProof, createAuthenticatedHandler } from '../../backend/eaglevault-core/src/auth-http.mjs';
import { VaultRecords } from '../../backend/eaglevault-core/src/vault-records.mjs';
import { EagleVaultClient } from '../../web/src/api/eaglevault-client.ts';
import { EagleVaultSession } from '../../web/src/auth/eaglevault-session.ts';
import { BitwardenCryptoProvider } from '../../web/src/crypto/bitwarden-crypto.ts';

const origin = 'https://api.example.test';
const pepper = '9a'.repeat(32);
const password = 'Synthetic EagleVault login fixture';
const registrationCode = 'synthetic-invite';
const email = 'test@example.test';

function setup(t) {
  let now = Date.now();
  const stores = new Map();
  const handle = createAuthenticatedHandler({
    pepper, registrationCode, now: () => now,
    storeForAccount(account) {
      if (!stores.has(account)) {
        const db = new DatabaseSync(':memory:');
        t.after(() => db.close());
        const query = (sql, ...args) => db.prepare(sql).all(...args);
        const transaction = callback => {
          db.exec('BEGIN');
          try {
            const output = callback();
            db.exec('COMMIT');
            return output;
          } catch (error) {
            db.exec('ROLLBACK');
            throw error;
          }
        };
        const auth = new AccountStore(query, transaction);
        const records = new VaultRecords(query, transaction);
        stores.set(account, {
          db,
          register: auth.register.bind(auth),
          login: (proof, scope, digests, at) => auth.login(
            expected => checkProof(pepper, scope, proof, expected), digests, at),
          refresh: auth.refresh.bind(auth),
          authorize: auth.authorize.bind(auth),
          logout: auth.logout.bind(auth),
          syncRecords: records.sync.bind(records),
          writeRecord: records.write.bind(records)
        });
      }
      return stores.get(account);
    }
  });
  return { stores, fetch: (url, init) => handle(new Request(url, init)), advance: ms => { now += ms; } };
}

test('Web registration, SDK encryption, cross-session conflicts, removal and wrong passwords', async t => {
  const { stores, fetch } = setup(t);
  const first = new EagleVaultSession(origin, fetch);
  await first.unlock(email, password, registrationCode);
  const second = new EagleVaultSession(origin, fetch);
  await second.unlock(email.toUpperCase(), password);

  const entry = { kind: 'login', name: 'Example', username: 'synthetic', password: 'record-secret',
    url: 'https://example.test', notes: '', folderId: '' };
  await first.save(entry);
  const [read] = await second.sync();
  assert.deepEqual(read, { ...entry, id: read.id, revision: 1 });
  const [{ db }] = stores.values();
  const [{ ciphertext }] = db.prepare('SELECT ciphertext FROM vault_records').all();
  assert.match(ciphertext, /^2\./);
  assert.ok(!ciphertext.includes(entry.password));

  await first.save({ ...entry, name: 'updated' }, read);
  await assert.rejects(second.save(entry, read), /changed elsewhere/);
  const [updated] = await second.sync();
  await second.delete(updated);
  assert.deepEqual(await first.sync(), []);
  await first.lock();
  await second.lock();
  await assert.rejects(first.sync(), /locked/);
  await assert.rejects(new EagleVaultSession(origin, fetch).unlock(email, 'Wrong synthetic password'), /HTTP 401/);
});

test('refresh is single-use and logout revokes access and refresh tokens', async t => {
  const { fetch, advance } = setup(t);
  const client = new EagleVaultClient(origin, async () => '', fetch);
  const sdk = new BitwardenCryptoProvider();
  const kdf = await client.kdf();
  const master = sdk.deriveMasterKey(password, email, kdf);
  const proof = await sdk.deriveMasterPasswordAuthenticationHash(password, master);
  const wrapped = sdk.encryptUserKeyWithMasterPassword(sdk.generateUserKey(), password, email, kdf);
  await client.register(email, proof, wrapped, registrationCode);
  const initial = await client.login(email, proof);
  const previous = new EagleVaultClient(origin, async () => initial.accessToken, fetch);
  assert.deepEqual((await previous.sync()).records, []);
  advance(15 * 60_000);
  await assert.rejects(previous.sync(), /HTTP 401/);

  const rotations = await Promise.allSettled([client.refresh(initial.refreshToken), client.refresh(initial.refreshToken)]);
  assert.equal(rotations.filter(result => result.status === 'fulfilled').length, 1);
  const current = rotations.find(result => result.status === 'fulfilled').value;
  const active = new EagleVaultClient(origin, async () => current.accessToken, fetch);
  assert.deepEqual((await active.sync()).records, []);
  await client.logout(current.refreshToken);
  await assert.rejects(active.sync(), /HTTP 401/);
  await assert.rejects(client.refresh(current.refreshToken), /HTTP 401/);
});
