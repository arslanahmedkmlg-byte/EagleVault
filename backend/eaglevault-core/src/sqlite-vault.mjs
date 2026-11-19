// One database per authenticated account. Callers resolve account identity before opening it.
// The SQL and transaction interfaces can also be implemented by a standalone SQLite host.
const schemaVersion = 2;
const maxRecordsPerSnapshot = 100_000;
const maxSnapshotBytes = 16 * 1024 * 1024;
const idPattern = /^[a-zA-Z0-9_-]{1,64}$/;

function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) ||
      snapshot.format !== 'eaglevault-encrypted-vault' ||
      snapshot.version !== schemaVersion ||
      !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0 ||
      !Array.isArray(snapshot.records) || snapshot.records.length > maxRecordsPerSnapshot ||
      Object.keys(snapshot).some(key => !['format', 'version', 'revision', 'records'].includes(key))) {
    throw new TypeError('Invalid encrypted vault snapshot');
  }

  let totalBytes = 0;
  const ids = new Set();
  const revisions = new Set();
  for (const record of snapshot.records) {
    if (!record || typeof record !== 'object' || Array.isArray(record) ||
        Object.keys(record).some(key => !['kind', 'id', 'revision', 'ciphertext'].includes(key)) ||
        !['item', 'folder'].includes(record.kind) ||
        typeof record.id !== 'string' || !idPattern.test(record.id) ||
        !Number.isSafeInteger(record.revision) || record.revision < 1 ||
        record.revision > snapshot.revision ||
        (record.ciphertext !== null && (typeof record.ciphertext !== 'string' ||
          record.ciphertext.length === 0))) {
      throw new TypeError('Invalid encrypted vault record in snapshot');
    }

    const key = record.kind + ':' + record.id;
    if (ids.has(key) || revisions.has(record.revision)) {
      throw new TypeError('Duplicate encrypted vault record in snapshot');
    }
    ids.add(key);
    revisions.add(record.revision);
    if (record.ciphertext !== null) {
      totalBytes += new TextEncoder().encode(record.ciphertext).length;
      if (totalBytes > maxSnapshotBytes ||
          new TextEncoder().encode(record.ciphertext).length > 128 * 1024) {
        throw new TypeError('Encrypted vault snapshot exceeds the size limit');
      }
    }
  }
}

export class SqliteVault {
  constructor(sql, transaction) {
    this.sql = sql;
    this.transaction = transaction;
    transaction(() => {
      sql.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      )`);
      const applied = sql.exec('SELECT MAX(version) AS version FROM schema_migrations').toArray()[0]?.version ?? 0;
      if (applied > schemaVersion) throw new Error('Database schema is newer than this EagleVault Core version');
      if (applied < 1) {
        sql.exec('CREATE TABLE IF NOT EXISTS vault_clock (id INTEGER PRIMARY KEY CHECK (id = 1), revision INTEGER NOT NULL)');
        sql.exec('INSERT OR IGNORE INTO vault_clock VALUES (1, 0)');
        sql.exec(`CREATE TABLE IF NOT EXISTS vault_records (
          kind TEXT NOT NULL CHECK (kind IN ('item', 'folder')),
          id TEXT NOT NULL,
          revision INTEGER NOT NULL UNIQUE,
          ciphertext TEXT,
          PRIMARY KEY (kind, id)
        )`);
        sql.exec('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
          1, new Date().toISOString());
      }
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

  list(kind) {
    if (!['item', 'folder'].includes(kind)) throw new TypeError('Invalid vault record kind');
    return this.transaction(() => this.sql.exec(
      'SELECT kind, id, revision, ciphertext FROM vault_records WHERE kind = ? AND ciphertext IS NOT NULL ORDER BY revision',
      kind
    ).toArray());
  }

  exportSnapshot() {
    return this.transaction(() => {
      const [{ revision }] = this.sql.exec('SELECT revision FROM vault_clock WHERE id = 1').toArray();
      const records = this.sql.exec(
        'SELECT kind, id, revision, ciphertext FROM vault_records ORDER BY revision'
      ).toArray();
      return {
        format: 'eaglevault-encrypted-vault',
        version: schemaVersion,
        revision,
        records,
      };
    });
  }

  importSnapshot(snapshot) {
    validateSnapshot(snapshot);
    return this.transaction(() => {
      this.sql.exec('DELETE FROM vault_records');
      for (const record of snapshot.records) {
        this.sql.exec(
          'INSERT INTO vault_records (kind, id, revision, ciphertext) VALUES (?, ?, ?, ?)',
          record.kind, record.id, record.revision, record.ciphertext
        );
      }
      this.sql.exec('UPDATE vault_clock SET revision = ? WHERE id = 1', snapshot.revision);
    });
  }
}
