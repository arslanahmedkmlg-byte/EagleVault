// One database per authenticated account. Callers resolve account identity before opening it.
// The SQL and transaction interfaces can also be implemented by a standalone SQLite host.
export class SqliteVault {
  constructor(sql, transaction) {
    this.sql = sql;
    this.transaction = transaction;
    transaction(() => {
      sql.exec('CREATE TABLE IF NOT EXISTS vault_clock (id INTEGER PRIMARY KEY CHECK (id = 1), revision INTEGER NOT NULL)');
      sql.exec('INSERT OR IGNORE INTO vault_clock VALUES (1, 0)');
      sql.exec(`CREATE TABLE IF NOT EXISTS vault_records (
        kind TEXT NOT NULL CHECK (kind IN ('item', 'folder')),
        id TEXT NOT NULL,
        revision INTEGER NOT NULL UNIQUE,
        ciphertext TEXT,
        PRIMARY KEY (kind, id)
      )`);
    });
  }

  // A null ciphertext is a tombstone. expectedRevision=0 is create-only.
  write({ kind, id, expectedRevision, ciphertext }) {
    if (!['item', 'folder'].includes(kind) ||
        typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(id) ||
        !Number.isSafeInteger(expectedRevision) || expectedRevision < 0 ||
        (ciphertext !== null && (typeof ciphertext !== 'string' || ciphertext.length === 0 ||
          new TextEncoder().encode(ciphertext).length > 128 * 1024))) {
      throw new TypeError('Invalid vault record');
    }

    return this.transaction(() => {
      const [current] = this.sql.exec(
        'SELECT revision, ciphertext FROM vault_records WHERE kind = ? AND id = ?', kind, id
      ).toArray();
      const currentRevision = current?.revision ?? 0;
      if (currentRevision !== expectedRevision || current?.ciphertext === null ||
          (!current && ciphertext === null)) {
        return { conflict: true, revision: currentRevision };
      }

      const [{ revision }] = this.sql.exec(
        'UPDATE vault_clock SET revision = revision + 1 WHERE id = 1 RETURNING revision'
      ).toArray();
      this.sql.exec(`INSERT INTO vault_records (kind, id, revision, ciphertext) VALUES (?, ?, ?, ?)
        ON CONFLICT(kind, id) DO UPDATE SET revision = excluded.revision, ciphertext = excluded.ciphertext`,
        kind, id, revision, ciphertext);
      return { conflict: false, revision };
    });
  }

  sync(after, limit = 100) {
    if (!Number.isSafeInteger(after) || after < 0 ||
        !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new TypeError('Invalid vault cursor or limit');
    }

    return this.transaction(() => {
      const [{ revision }] = this.sql.exec('SELECT revision FROM vault_clock WHERE id = 1').toArray();
      if (after > revision) throw new RangeError('Vault cursor exceeds current revision');
      const records = this.sql.exec(`SELECT kind, id, revision, ciphertext FROM vault_records
        WHERE revision > ? ORDER BY revision LIMIT ?`, after, limit + 1).toArray();
      const hasMore = records.length > limit;
      if (hasMore) records.pop();
      return { records, cursor: hasMore ? records.at(-1).revision : revision, hasMore };
    });
  }
}
