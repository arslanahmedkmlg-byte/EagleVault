// This repository is scoped to one account by the caller's storage instance.
export class VaultRecords {
  constructor(query, transaction) {
    this.query = query;
    this.transaction = transaction;
    query(`CREATE TABLE IF NOT EXISTS vault_records (
      id TEXT PRIMARY KEY,
      ciphertext TEXT,
      revision INTEGER NOT NULL UNIQUE,
      CHECK (revision > 0)
    )`);
  }

  // A null ciphertext is a tombstone. Revision zero means "create only".
  write({ id, ciphertext, expectedRevision }) {
    if (typeof id !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(id) ||
        !Number.isSafeInteger(expectedRevision) || expectedRevision < 0 ||
        (ciphertext === null
          ? expectedRevision === 0
          : typeof ciphertext !== 'string' || ciphertext.length === 0 ||
            new TextEncoder().encode(ciphertext).byteLength > 65_536)) {
      throw new TypeError('Invalid vault mutation');
    }

    return this.transaction(() => {
      const [current] = this.query('SELECT revision, ciphertext FROM vault_records WHERE id = ?', id);
      if ((current?.revision ?? 0) !== expectedRevision || current?.ciphertext === null) {
        return { status: 'conflict', revision: current?.revision ?? 0 };
      }
      const [{ revision }] = this.query('SELECT COALESCE(MAX(revision), 0) + 1 AS revision FROM vault_records');
      if (!Number.isSafeInteger(revision)) throw new RangeError('Vault revision exhausted');
      this.query(`INSERT INTO vault_records (id, ciphertext, revision) VALUES (?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET ciphertext = excluded.ciphertext, revision = excluded.revision`,
      id, ciphertext, revision);
      return { status: 'saved', revision };
    });
  }

  sync({ after = 0, limit = 25 } = {}) {
    if (!Number.isSafeInteger(after) || after < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new TypeError('Invalid sync cursor or page size');
    }
    const records = this.query(`SELECT id, ciphertext, revision FROM vault_records
      WHERE revision > ? ORDER BY revision LIMIT ?`, after, limit + 1);
    const hasMore = records.length > limit;
    if (hasMore) records.pop();
    return { records, cursor: records.at(-1)?.revision ?? after, hasMore };
  }
}
