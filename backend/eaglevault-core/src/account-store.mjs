const minute = 60_000;
const accessLifetime = 15 * minute;
const refreshLifetime = 7 * 24 * 60 * minute;
const loginWindow = 15 * minute;

export class AccountStore {
  constructor(query, transaction) {
    this.query = query;
    this.transaction = transaction;
    query(`CREATE TABLE IF NOT EXISTS account (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      proof_tag TEXT NOT NULL,
      wrapped_key TEXT NOT NULL
    )`);
    query(`CREATE TABLE IF NOT EXISTS login_window (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      opened INTEGER NOT NULL,
      attempts INTEGER NOT NULL
    )`);
    query(`CREATE TABLE IF NOT EXISTS sessions (
      access_digest TEXT PRIMARY KEY,
      refresh_digest TEXT NOT NULL UNIQUE,
      access_expires INTEGER NOT NULL,
      refresh_expires INTEGER NOT NULL
    )`);
  }

  register(proofTag, wrappedKey) {
    return this.query(`INSERT INTO account (id, proof_tag, wrapped_key)
      VALUES (1, ?, ?) ON CONFLICT (id) DO NOTHING RETURNING id`, proofTag, wrappedKey).length === 1;
  }

  async login(verify, digests, now) {
    const allowed = this.query(`INSERT INTO login_window VALUES (1, ?, 1)
      ON CONFLICT (id) DO UPDATE SET
        attempts = CASE WHEN opened <= ? THEN 1 ELSE attempts + 1 END,
        opened = CASE WHEN opened <= ? THEN excluded.opened ELSE opened END
      WHERE opened <= ? OR attempts < 10 RETURNING attempts`,
    now, now - loginWindow, now - loginWindow, now - loginWindow).length === 1;
    if (!allowed) return { status: 'rate_limited' };

    const [account] = this.query('SELECT proof_tag, wrapped_key FROM account WHERE id = 1');
    const valid = await verify(account?.proof_tag ?? '0'.repeat(64));
    if (!account || !valid) return { status: 'unauthorized' };

    return this.transaction(() => {
      this.query('DELETE FROM sessions WHERE refresh_expires <= ?', now);
      const [{ count }] = this.query('SELECT COUNT(*) AS count FROM sessions');
      if (count >= 25) return { status: 'session_limit' };
      this.query('INSERT INTO sessions VALUES (?, ?, ?, ?)',
        digests.access, digests.refresh, now + accessLifetime, now + refreshLifetime);
      return { status: 'ok', wrappedKey: account.wrapped_key, expiresAt: now + accessLifetime };
    });
  }

  refresh(previousDigest, digests, now) {
    const expiresAt = now + accessLifetime;
    const rotated = this.query(`UPDATE sessions SET access_digest = ?, refresh_digest = ?, access_expires = MIN(?, refresh_expires)
      WHERE refresh_digest = ? AND refresh_expires > ? RETURNING access_expires`,
    digests.access, digests.refresh, expiresAt, previousDigest, now);
    return rotated.length === 1 ? { status: 'ok', expiresAt: rotated[0].access_expires } : { status: 'unauthorized' };
  }

  authorize(digest, now) {
    return this.query('SELECT 1 FROM sessions WHERE access_digest = ? AND access_expires > ?', digest, now).length === 1;
  }

  logout(refreshDigest) {
    this.query('DELETE FROM sessions WHERE refresh_digest = ?', refreshDigest);
  }
}
