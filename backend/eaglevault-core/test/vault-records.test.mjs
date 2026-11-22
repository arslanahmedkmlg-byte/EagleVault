import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { VaultStore } from '../src/index.mjs';

function createStorage(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  return { storage: {
    sql: { exec: (sql, ...params) => ({ toArray: () => db.prepare(sql).all(...params) }) },
    transactionSync(callback) {
      db.exec('BEGIN');
      try {
        const result = callback();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }
  } };
}

const first = '00000000-0000-4000-8000-000000000001';
const second = '00000000-0000-4000-8000-000000000002';

test('conflicting writes, cursor pagination, tombstones and reconstructed stores', async t => {
  const storage = createStorage(t);
  const store = new VaultStore(storage);
  const write = (id, expectedRevision, ciphertext = 'opaque-test-payload') =>
    store.writeRecord({ id, expectedRevision, ciphertext });

  assert.deepEqual(await write(first, 0), { status: 'saved', revision: 1 });
  assert.deepEqual(await write(second, 0), { status: 'saved', revision: 2 });
  const results = await Promise.all([write(first, 1, 'update'), write(first, 1, 'conflict')]);
  assert.deepEqual(results, [{ status: 'saved', revision: 3 }, { status: 'conflict', revision: 3 }]);
  const page = await store.syncRecords({ limit: 1 });
  assert.equal(page.records[0].id, second);
  assert.equal(page.cursor, 2);
  assert.equal(page.hasMore, true);

  assert.deepEqual(await write(first, 3, null), { status: 'saved', revision: 4 });
  assert.deepEqual(await write(first, 4, 'resurrection'), { status: 'conflict', revision: 4 });
  const resumed = await new VaultStore(storage).syncRecords({ after: page.cursor });
  assert.deepEqual({ ...resumed, records: resumed.records.map(record => ({ ...record })) }, {
    records: [{ id: first, ciphertext: null, revision: 4 }], cursor: 4, hasMore: false
  });
  assert.deepEqual(await new VaultStore(createStorage(t)).syncRecords(), {
    records: [], cursor: 0, hasMore: false
  });
});

test('invalid mutations do not allocate a revision', async t => {
  const store = new VaultStore(createStorage(t));
  await assert.rejects(store.writeRecord({ id: first, expectedRevision: 0, ciphertext: null }), TypeError);
  await assert.rejects(store.syncRecords({ after: -1 }), TypeError);
  assert.deepEqual(await store.syncRecords(), { records: [], cursor: 0, hasMore: false });
});
