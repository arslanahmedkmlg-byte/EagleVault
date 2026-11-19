import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { AccountStore } from '../src/account-store.mjs';
import { sha256Hex } from '../src/auth.mjs';

function openStore(t) {
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
    },
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
  return { store: new AccountStore(sql, transaction), db };
}

function bytesBase64(size) {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function wrappedKeyFixture() {
  return `2.${bytesBase64(16)}|${bytesBase64(80)}|${bytesBase64(32)}`;
}

test('registers a normalized account, verifies derived auth hashes and rotates sessions', async t => {
  const { store, db } = openStore(t);
  const now = 1_800_000_000_000;
  const accountKey = 'a'.repeat(64);
  const authenticationHash = bytesBase64(32);
  const wrappedUserKey = wrappedKeyFixture();
  const registration = await store.register({
    email: 'user@example.test',
    accountKey,
    authenticationHash,
    wrappedUserKey,
    now,
  });
  assert.equal(registration.status, 201);
  assert.deepEqual(await registration.json(), { status: 'created' });
  assert.equal(db.prepare('SELECT email FROM account').get().email, 'user@example.test');
  assert.notEqual(db.prepare('SELECT verifier FROM account').get().verifier.toString('base64'), authenticationHash);

  const duplicate = await store.register({
    email: 'user@example.test',
    accountKey,
    authenticationHash,
    wrappedUserKey,
    now,
  });
  assert.equal(duplicate.status, 409);

  const invalid = await store.login({
    email: 'user@example.test',
    accountKey,
    authenticationHash: bytesBase64(32),
    now,
    accessLifetimeMs: 60_000,
    refreshLifetimeMs: 600_000,
  });
  assert.equal(invalid.status, 401);

  const login = await store.login({
    email: 'user@example.test',
    accountKey,
    authenticationHash,
    now,
    accessLifetimeMs: 60_000,
    refreshLifetimeMs: 600_000,
  });
  assert.equal(login.status, 200);
  const first = await login.json();
  assert.match(first.access_token, /^ev1\.[a-f0-9]{64}\.[A-Za-z0-9_-]{43}$/);
  assert.match(first.refresh_token, /^evr1\.[a-f0-9]{64}\.[A-Za-z0-9_-]{43}$/);
  assert.equal(first.Key, wrappedUserKey);

  const firstAccessHash = await sha256Hex(first.access_token);
  const firstRefreshHash = await sha256Hex(first.refresh_token);
  assert.equal(store.validateAccess(firstAccessHash, now + 59_999), true);
  assert.equal(store.validateAccess(firstAccessHash, now + 60_000), false);

  const refreshed = await store.refresh({
    refreshToken: first.refresh_token,
    now: now + 1,
    accessLifetimeMs: 60_000,
    refreshLifetimeMs: 600_000,
  });
  assert.equal(refreshed.status, 200);
  const second = await refreshed.json();
  assert.notEqual(second.access_token, first.access_token);
  assert.equal(store.validateAccess(firstAccessHash, now + 1), false);

  const replay = await store.refresh({
    refreshToken: first.refresh_token,
    now: now + 2,
    accessLifetimeMs: 60_000,
    refreshLifetimeMs: 600_000,
  });
  assert.equal(replay.status, 401);

  const secondAccessHash = await sha256Hex(second.access_token);
  store.logout(secondAccessHash);
  assert.equal(store.validateAccess(secondAccessHash, now + 3), false);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 0);
});

test('rate limits repeated authentication attempts', async t => {
  const { store } = openStore(t);
  const now = 1_800_000_000_000;
  const accountKey = 'b'.repeat(64);
  const authenticationHash = bytesBase64(32);
  assert.equal((await store.register({
    email: 'limited@example.test',
    accountKey,
    authenticationHash,
    wrappedUserKey: wrappedKeyFixture(),
    now,
  })).status, 201);

  for (let attempt = 0; attempt < 10; attempt++) {
    const response = await store.login({
      email: 'limited@example.test',
      accountKey,
      authenticationHash: bytesBase64(32),
      now: now + attempt,
      accessLifetimeMs: 60_000,
      refreshLifetimeMs: 600_000,
    });
    assert.equal(response.status, 401);
  }
  const limited = await store.login({
    email: 'limited@example.test',
    accountKey,
    authenticationHash,
    now: now + 11,
    accessLifetimeMs: 60_000,
    refreshLifetimeMs: 600_000,
  });
  assert.equal(limited.status, 429);
});
