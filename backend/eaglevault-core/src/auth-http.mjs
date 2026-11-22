import { importPepper, newToken, tag, tokenDigest, verifyTag } from './auth-crypto.mjs';
import { createVaultHandler, errorResponse, json, readJson } from './vault-http.mjs';

const tokenPattern = /^(a|r)\.([a-f0-9]{64})\.[a-f0-9]{64}\.([a-f0-9]{64})$/;
const proofPattern = /^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/;
const wrappedKeyPattern = /^2\.[A-Za-z0-9+/]{22}==\|[A-Za-z0-9+/]{107}=\|[A-Za-z0-9+/]{43}=$/;
const kdf = { type: 'argon2id', iterations: 3, memory: 64, parallelism: 4 };

function emailAddress(email) {
  if (typeof email !== 'string' || email.length > 254) throw new TypeError('Invalid email');
  const cleaned = email.trim().toLowerCase();
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,63}$/.test(cleaned)) {
    throw new TypeError('Invalid email');
  }
  return cleaned;
}

const bodyFields = {
  register: ['email', 'proof', 'wrappedKey', 'registrationCode'],
  login: ['email', 'proof'],
  refresh: ['refreshToken'],
  logout: ['refreshToken']
};

async function sessionFor(key, account) {
  const [accessToken, refreshToken] = await Promise.all([
    newToken(key, account, 'a'), newToken(key, account, 'r')
  ]);
  const [access, refresh] = await Promise.all([tokenDigest(accessToken), tokenDigest(refreshToken)]);
  return { tokens: { accessToken, refreshToken }, digests: { access, refresh } };
}

export function createAuthenticatedHandler({ storeForAccount, pepper, registrationCode, now = Date.now }) {
  const key = importPepper(pepper);
  async function verifiedAccount(token, type) {
    const parsed = typeof token === 'string' && tokenPattern.exec(token);
    if (parsed?.[1] !== type) return null;
    const valid = await verifyTag(await key, 'session', token.slice(0, -65), parsed[3]);
    return valid ? parsed[2] : null;
  }

  const vault = createVaultHandler({
    async authenticate(request) {
      const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
      const account = await verifiedAccount(token, 'a');
      if (!account) return null;
      return await storeForAccount(account).authorize(await tokenDigest(token), now()) ? account : null;
    },
    storeForAccount
  });

  return async function handle(request) {
    const url = new URL(request.url);
    if (url.protocol !== 'https:') return json({ error: 'https_required' }, 400);
    if (url.pathname.startsWith('/v1/vault/')) return vault(request);
    if (request.method === 'GET' && url.pathname === '/v1/auth/kdf') return json(kdf);
    if (request.method !== 'POST' || !Object.keys(bodyFields).some(
      action => url.pathname === '/v1/auth/' + action)) return json({ error: 'not_found' }, 404);

    try {
      const action = url.pathname.slice('/v1/auth/'.length);
      const body = await readJson(request, 4096);
      const fields = bodyFields[action];
      if (!body || typeof body !== 'object' || Array.isArray(body) ||
          Object.keys(body).length !== fields.length ||
          !fields.every(field => typeof body[field] === 'string')) throw new TypeError('Invalid body');
      if (action === 'refresh' || action === 'logout') {
        const token = body.refreshToken;
        const account = await verifiedAccount(token, 'r');
        if (!account) return json({ error: 'unauthorized' }, 401);
        const digest = await tokenDigest(token);
        const store = storeForAccount(account);
        if (action === 'logout') {
          await store.logout(digest);
          return json({ status: 'ok' });
        }
        const { tokens, digests } = await sessionFor(await key, account);
        const result = await store.refresh(digest, digests, now());
        return result.status === 'ok' ? json({ ...tokens, expiresAt: result.expiresAt }) : json({ error: 'unauthorized' }, 401);
      }

      const email = emailAddress(body.email);
      if (typeof body.proof !== 'string' || !proofPattern.test(body.proof)) throw new TypeError('Invalid proof');
      const account = await tag(await key, 'account', email);
      const store = storeForAccount(account);
      if (action === 'register') {
        const invite = body.registrationCode;
        if (!registrationCode || typeof invite !== 'string' ||
            !await verifyTag(await key, 'registration', invite, await tag(await key, 'registration', registrationCode))) {
          return json({ error: 'registration_unavailable' }, 403);
        }
        if (typeof body.wrappedKey !== 'string' || !wrappedKeyPattern.test(body.wrappedKey)) {
          throw new TypeError('Invalid wrapped key');
        }
        const created = await store.register(await tag(await key, 'proof:' + account, body.proof), body.wrappedKey);
        return created ? json({ status: 'created' }, 201) : json({ error: 'registration_unavailable' }, 409);
      }

      const { tokens, digests } = await sessionFor(await key, account);
      const result = await store.login(body.proof, account, digests, now());
      if (result.status === 'rate_limited') return json({ error: 'rate_limited' }, 429);
      if (result.status === 'session_limit') return json({ error: 'session_limit' }, 409);
      if (result.status !== 'ok') return json({ error: 'unauthorized' }, 401);
      return json({ ...tokens, expiresAt: result.expiresAt, wrappedKey: result.wrappedKey });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export async function checkProof(pepper, account, proof, expected) {
  return verifyTag(await importPepper(pepper), 'proof:' + account, proof, expected);
}
