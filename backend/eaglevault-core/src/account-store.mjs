import { SqliteVault } from './sqlite-vault.mjs';
import { base64Url, sha256Hex } from './auth.mjs';

const verifierIterations = 600_000;
const encoder = new TextEncoder();

function decodeBase64(text, size) {
  if (typeof text !== 'string' || text.length !== Math.ceil(size / 3) * 4) return null;
  try {
    const binary = atob(text);
    if (binary.length !== size || btoa(binary) !== text) return null;
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function equalBytes(left, right) {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function deriveVerifier(authenticationHash, salt) {
  const key = await crypto.subtle.importKey('raw', authenticationHash, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    salt,
    iterations: verifierIterations,
    hash: 'SHA-256',
  }, key, 256);
  return new Uint8Array(bits);
}

function jsonResponse(status, body) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

export class AccountStore {
  constructor(sql, transaction) {
    this.sql = sql;
    this.transaction = transaction;
    this.vault = new SqliteVault(sql, transaction);
    transaction(() => {
      const applied = sql.exec('SELECT MAX(version) AS version FROM schema_migrations').toArray()[0]?.version ?? 0;
      if (applied > 2) throw new Error('Database schema is newer than this EagleVault Core version');
      sql.exec(`CREATE TABLE IF NOT EXISTS account (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        email TEXT NOT NULL UNIQUE,
        account_key TEXT NOT NULL UNIQUE,
        verifier_salt BLOB NOT NULL,
        verifier BLOB NOT NULL,
        wrapped_user_key TEXT NOT NULL
      )`);
      sql.exec(`CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        access_hash TEXT NOT NULL UNIQUE,
        refresh_hash TEXT NOT NULL UNIQUE,
        access_expires_at INTEGER NOT NULL,
        refresh_expires_at INTEGER NOT NULL
      )`);
      sql.exec(`CREATE TABLE IF NOT EXISTS auth_limits (
        key TEXT PRIMARY KEY,
        window_start INTEGER NOT NULL,
        attempts INTEGER NOT NULL
      )`);
      if (applied < 2) {
        sql.exec('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
          2, new Date().toISOString());
      }
    });
  }

  consumeLimit(key, now, windowMs, maxAttempts) {
    return this.transaction(() => {
      const current = this.sql.exec(
        'SELECT window_start, attempts FROM auth_limits WHERE key = ?', key
      ).toArray()[0];
      if (!current || now - current.window_start >= windowMs || now < current.window_start) {
        this.sql.exec(`INSERT INTO auth_limits (key, window_start, attempts) VALUES (?, ?, 1)
          ON CONFLICT(key) DO UPDATE SET window_start = excluded.window_start, attempts = 1`,
        key, now);
        return true;
      }
      if (current.attempts >= maxAttempts) return false;
      this.sql.exec('UPDATE auth_limits SET attempts = attempts + 1 WHERE key = ?', key);
      return true;
    });
  }

  async register({ email, accountKey, authenticationHash, wrappedUserKey, now }) {
    const suppliedHash = decodeBase64(authenticationHash, 32);
    if (!suppliedHash || typeof wrappedUserKey !== 'string' ||
        !/^2\.[A-Za-z0-9+/]{22}==\|[A-Za-z0-9+/]{107}=\|[A-Za-z0-9+/]{43}=$/.test(wrappedUserKey)) {
      return jsonResponse(400, { error: 'invalid_registration' });
    }

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const verifier = await deriveVerifier(suppliedHash, salt);
    suppliedHash.fill(0);
    const created = this.transaction(() => {
      const exists = this.sql.exec('SELECT 1 FROM account WHERE singleton = 1').toArray().length > 0;
      if (exists) return false;
      this.sql.exec(`INSERT INTO account
        (singleton, email, account_key, verifier_salt, verifier, wrapped_user_key)
        VALUES (1, ?, ?, ?, ?, ?)`,
      email, accountKey, salt, verifier, wrappedUserKey);
      return true;
    });
    salt.fill(0);
    verifier.fill(0);
    return created
      ? jsonResponse(201, { status: 'created' })
      : jsonResponse(409, { error: 'account_exists' });
  }

  async login({ email, accountKey, authenticationHash, now, accessLifetimeMs, refreshLifetimeMs }) {
    if (!this.consumeLimit('login', now, 15 * 60 * 1000, 10)) {
      return jsonResponse(429, { error: 'rate_limited' });
    }
    const suppliedHash = decodeBase64(authenticationHash, 32);
    if (!suppliedHash) return jsonResponse(401, { error: 'invalid_credentials' });
    const account = this.sql.exec(
      'SELECT email, account_key, verifier_salt, verifier, wrapped_user_key FROM account WHERE singleton = 1'
    ).toArray()[0];
    const salt = account ? new Uint8Array(account.verifier_salt) : new Uint8Array(16);
    const actual = await deriveVerifier(suppliedHash, salt);
    suppliedHash.fill(0);
    salt.fill(0);
    const expected = account ? new Uint8Array(account.verifier) : new Uint8Array(32);
    const valid = Boolean(account && account.email === email && account.account_key === accountKey) &&
      equalBytes(actual, expected);
    actual.fill(0);
    expected.fill(0);
    if (!valid) return jsonResponse(401, { error: 'invalid_credentials' });
    return this.createSession(account, now, accessLifetimeMs, refreshLifetimeMs);
  }

  async createSession(account, now, accessLifetimeMs, refreshLifetimeMs) {
    const accessSecret = crypto.getRandomValues(new Uint8Array(32));
    const refreshSecret = crypto.getRandomValues(new Uint8Array(32));
    const accessToken = `ev1.${account.account_key}.${base64Url(accessSecret)}`;
    const refreshToken = `evr1.${account.account_key}.${base64Url(refreshSecret)}`;
    accessSecret.fill(0);
    refreshSecret.fill(0);
    const [accessHash, refreshHash] = await Promise.all([
      sha256Hex(accessToken),
      sha256Hex(refreshToken),
    ]);
    const expiresIn = Math.floor(accessLifetimeMs / 1000);
    this.transaction(() => {
      this.sql.exec(`INSERT INTO sessions
        (session_id, access_hash, refresh_hash, access_expires_at, refresh_expires_at)
        VALUES (?, ?, ?, ?, ?)`,
      crypto.randomUUID(), accessHash, refreshHash, now + accessLifetimeMs, now + refreshLifetimeMs);
    });
    return jsonResponse(200, {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: expiresIn,
      token_type: 'Bearer',
      Key: account.wrapped_user_key,
    });
  }

  async refresh({ refreshToken, now, accessLifetimeMs, refreshLifetimeMs }) {
    const refreshHash = await sha256Hex(refreshToken);
    const account = this.sql.exec(
      'SELECT email, account_key, wrapped_user_key FROM account WHERE singleton = 1'
    ).toArray()[0];
    const session = this.sql.exec(
      'SELECT session_id, refresh_expires_at FROM sessions WHERE refresh_hash = ?', refreshHash
    ).toArray()[0];
    if (!account || !session || session.refresh_expires_at <= now) {
      return jsonResponse(401, { error: 'invalid_grant' });
    }
    this.transaction(() => {
      this.sql.exec('DELETE FROM sessions WHERE session_id = ?', session.session_id);
    });
    return this.createSession(account, now, accessLifetimeMs, refreshLifetimeMs);
  }

  validateAccess(accessHash, now) {
    const session = this.sql.exec(
      'SELECT 1 FROM sessions WHERE access_hash = ? AND access_expires_at > ?', accessHash, now
    ).toArray()[0];
    return Boolean(session);
  }

  logout(accessHash) {
    this.transaction(() => {
      this.sql.exec('DELETE FROM sessions WHERE access_hash = ?', accessHash);
    });
  }
}

export class RateLimitStore {
  constructor(sql, transaction) {
    this.sql = sql;
    this.transaction = transaction;
    transaction(() => {
      sql.exec(`CREATE TABLE IF NOT EXISTS rate_limits (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        window_start INTEGER NOT NULL,
        requests INTEGER NOT NULL
      )`);
    });
  }

  consume({ now, windowMs, maxRequests }) {
    return this.transaction(() => {
      const current = this.sql.exec(
        'SELECT window_start, requests FROM rate_limits WHERE singleton = 1'
      ).toArray()[0];
      if (!current || now - current.window_start >= windowMs || now < current.window_start) {
        this.sql.exec(`INSERT INTO rate_limits (singleton, window_start, requests) VALUES (1, ?, 1)
          ON CONFLICT(singleton) DO UPDATE SET window_start = excluded.window_start, requests = 1`,
        now);
        return true;
      }
      if (current.requests >= maxRequests) return false;
      this.sql.exec('UPDATE rate_limits SET requests = requests + 1 WHERE singleton = 1');
      return true;
    });
  }
}

export function responseError(error) {
  if (error instanceof TypeError || error instanceof RangeError) {
    return jsonResponse(400, { error: 'invalid_request' });
  }
  throw error;
}
