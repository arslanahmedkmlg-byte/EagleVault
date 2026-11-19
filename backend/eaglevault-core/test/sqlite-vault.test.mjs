import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { SqliteVault } from '../src/sqlite-vault.mjs';

function openVault(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const sql = {
    exec(query, ...args) {
      const statement = db.prepare(query);
      if (statement.columns().length) {
        const rows = statement.all(...args).map(row => ({ ...row }));
        return { toArray: () => rows };
      }
      statement.run(...args);
      return { toArray: () => [] };
    }
  };
  const transaction = callback => {
    db.exec('BEGIN');
    try {
      const result = callback();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };
  return { vault: new SqliteVault(sql, transaction), db };
}

test('writes, conflicts and tombstones share one monotonic account cursor', t => {
  const { vault } = openVault(t);
  const item = { kind: 'item', id: 'record-1', expectedRevision: 0, ciphertext: 'opaque-fixture' };
  assert.deepEqual(vault.write(item), { conflict: false, revision: 1 });
  assert.deepEqual(vault.write(item), { conflict: true, revision: 1 });
  assert.deepEqual(vault.write({ ...item, kind: 'folder' }), { conflict: false, revision: 2 });
  assert.deepEqual(vault.write({ ...item, expectedRevision: 1, ciphertext: 'updated-fixture' }),
    { conflict: false, revision: 3 });
  assert.deepEqual(vault.sync(0, 1), {
    records: [{ kind: 'folder', id: item.id, revision: 2, ciphertext: item.ciphertext }],
    cursor: 2,
    hasMore: true
  });
  assert.equal(vault.sync(2, 1).records[0].ciphertext, 'updated-fixture');
  assert.deepEqual(vault.write({ ...item, expectedRevision: 3, ciphertext: null }),
    { conflict: false, revision: 4 });
  assert.deepEqual(vault.write({ ...item, expectedRevision: 4 }), { conflict: true, revision: 4 });
  assert.deepEqual(vault.sync(3), {
    records: [{ kind: 'item', id: item.id, revision: 4, ciphertext: null }],
    cursor: 4,
    hasMore: false
  });
});

test('invalid inputs and rolled-back writes do not advance the cursor', t => {
  const { vault, db } = openVault(t);
  const item = { kind: 'item', id: 'record-1', expectedRevision: 0, ciphertext: 'opaque-fixture' };
  assert.throws(() => vault.write({ ...item, ciphertext: '' }), TypeError);
  assert.throws(() => vault.sync(1), RangeError);
  db.exec(`CREATE TRIGGER reject_write BEFORE INSERT ON vault_records BEGIN
    SELECT RAISE(ABORT, 'test rollback');
  END`);
  assert.throws(() => vault.write(item), /test rollback/);
  assert.deepEqual(vault.sync(0), { records: [], cursor: 0, hasMore: false });
  assert.deepEqual(openVault(t).vault.sync(0), vault.sync(0));
});
