import { derivePasswordVerifier } from './auth.mjs';
const registerPath = '/v1/accounts';

function reply(status, body) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

function decodeBase64(text, size) {
  if (typeof text !== 'string' || text.length !== Math.ceil(size / 3) * 4) return null;
  try {
    const binary = atob(text);
    if (binary.length === size && btoa(binary) === text) {
      return Uint8Array.from(binary, character => character.charCodeAt(0));
    }
  } catch {
    return null;
  }
  return null;
}

async function readRegistration(request) {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json' ||
      !request.body) return null;
  const reader = request.body.getReader();
  const bytes = new Uint8Array(2048);
  let offset = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (offset + value.length > bytes.length) {
        await reader.cancel();
        return null;
      }
      bytes.set(value, offset);
      offset += value.length;
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, offset)));
  } catch {
    return null;
  } finally {
    bytes.fill(0);
    reader.releaseLock();
  }
}

function authorized(request, token) {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return false;
  const supplied = request.headers.get('authorization') ?? '';
  const expected = 'Bearer ' + token;
  if (supplied.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index++) {
    difference |= supplied.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

export async function registerSyntheticAccount(request, env) {
  if (!authorized(request, env?.TEST_REGISTRATION_TOKEN)) return reply(404, { error: 'not_found' });
  const body = await readRegistration(request);
  if (!body || typeof body.email !== 'string' || body.email.length > 254 ||
      typeof body.wrappedUserKey !== 'string' || typeof body.authenticationHash !== 'string' ||
      Object.keys(body).length !== 3) {
    return reply(400, { error: 'invalid_registration' });
  }

  const email = body.email.trim().toLowerCase();
  const hash = decodeBase64(body.authenticationHash, 32);
  const [iv, ciphertext, mac, extra] = body.wrappedUserKey.slice(2).split('|');
  if (!/^[a-z0-9][a-z0-9._+-]*@[a-z0-9][a-z0-9.-]*\.test$/.test(email) || !hash ||
      !body.wrappedUserKey.startsWith('2.') || extra !== undefined ||
      !decodeBase64(iv, 16) || !decodeBase64(ciphertext, 80) || !decodeBase64(mac, 32)) {
    hash?.fill(0);
    return reply(400, { error: 'invalid_registration' });
  }

  try {
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const verifier = await derivePasswordVerifier(hash, salt);
    try {
      const vault = env.VAULTS.get(env.VAULTS.idFromName('account:' + email));
      return await vault.fetch('https://vault.internal' + registerPath, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          salt: btoa(String.fromCharCode(...salt)),
          verifier: btoa(String.fromCharCode(...verifier)),
          wrappedUserKey: body.wrappedUserKey
        })
      });
    } finally {
      salt.fill(0);
      verifier.fill(0);
    }
  } finally {
    hash.fill(0);
  }
}

export function insertSyntheticAccount(storage, { salt, verifier, wrappedUserKey }) {
  const sql = storage.sql;
  const created = storage.transactionSync(() => {
    sql.exec(`CREATE TABLE IF NOT EXISTS staging_account (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      verifier_salt TEXT NOT NULL,
      verifier TEXT NOT NULL,
      wrapped_user_key TEXT NOT NULL
    )`);
    return sql.exec(
      'INSERT OR IGNORE INTO staging_account VALUES (1, ?, ?, ?) RETURNING singleton',
      salt, verifier, wrappedUserKey
    ).toArray().length === 1;
  });
  return created ? reply(201, { status: 'created' }) : reply(409, { error: 'account_exists' });
}
