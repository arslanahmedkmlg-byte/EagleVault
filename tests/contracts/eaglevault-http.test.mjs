import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createVaultHandler } from '../../backend/eaglevault-core/src/vault-http.mjs';
import { VaultRecords } from '../../backend/eaglevault-core/src/vault-records.mjs';
import { EagleVaultClient } from '../../web/src/api/eaglevault-client.ts';

const origin = 'https://api.example.test';
const id = '00000000-0000-4000-8000-000000000001';

test('the Web transport uses authenticated account-scoped sync and conditional writes', async t => {
  const stores = new Map();
  for (const account of ['alice', 'bob']) {
    const db = new DatabaseSync(':memory:');
    t.after(() => db.close());
    const records = new VaultRecords((sql, ...args) => db.prepare(sql).all(...args), callback => {
      db.exec('BEGIN');
      try {
        const result = callback();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    });
    stores.set(account, {
      syncRecords: options => records.sync(options),
      writeRecord: mutation => records.write(mutation),
    });
  }
  const handle = createVaultHandler({
    authenticate: request => {
      const token = request.headers.get('authorization');
      if (token === 'Bearer test-alice') return 'alice';
      if (token === 'Bearer test-bob') return 'bob';
      return null;
    },
    storeForAccount: account => stores.get(account),
  });
  const fetch = (url, init) => handle(new Request(url, init));
  const alice = new EagleVaultClient(origin, async () => 'test-alice', fetch);
  const bob = new EagleVaultClient(origin, async () => 'test-bob', fetch);

  assert.deepEqual(await alice.write(id, 0, 'opaque-fixture'), { status: 'saved', revision: 1 });
  assert.deepEqual(await alice.write(id, 0, 'another-fixture'), { status: 'conflict', revision: 1 });
  assert.equal((await alice.sync()).records[0].ciphertext, 'opaque-fixture');
  assert.deepEqual((await bob.sync()).records, []);
  assert.deepEqual(await alice.write(id, 1, null), { status: 'saved', revision: 2 });
  assert.deepEqual((await alice.sync(1)).records, [{ id, ciphertext: null, revision: 2 }]);
  assert.equal((await handle(new Request(origin + '/v1/vault/sync'))).status, 401);
  await assert.rejects(alice.sync(-1), /HTTP 400/);
  assert.throws(() => new EagleVaultClient('http://example.test', async () => 'test-alice'), TypeError);
});
