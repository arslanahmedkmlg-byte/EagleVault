import { registerSyntheticAccount, insertSyntheticAccount } from './registration.mjs';
import { corsResponse } from './http.mjs';
import { normalizeEmail, readBoundedJson, readBoundedText, sha256Hex } from './auth.mjs';
import { AccountStore, RateLimitStore as RateLimitStateStore } from './account-store.mjs';

const emailPattern = /^[a-z0-9][a-z0-9._+-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/;
const publicIterations = 600_000;
const accessLifetimeMs = 60 * 60 * 1000;
const refreshLifetimeMs = 30 * 24 * 60 * 60 * 1000;

function reply(status, body) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

function accountKeyFromToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3 || !['ev1', 'evr1'].includes(parts[0]) ||
      !/^[0-9a-f]{64}$/.test(parts[1]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[2])) return null;
  return parts[1];
}

function bearerToken(request) {
  const authorization = request.headers.get('authorization') ?? '';
  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  return match ? match[1] : null;
}

function getAccountVault(env, accountKey) {
  const account = env.VAULTS.get(env.VAULTS.idFromName('account:' + accountKey));
  return account;
}

async function consumeIpLimit(request, env, action, maxRequests, windowMs) {
  const source = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const key = await sha256Hex(action + ':' + source);
  const limiter = env.RATE_LIMITS.get(env.RATE_LIMITS.idFromName('rate:' + key));
  const response = await limiter.fetch('https://rate.internal/consume', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ now: Date.now(), maxRequests, windowMs }),
  });
  return response.status === 200;
}

async function registerAccount(request, env) {
  if (!await consumeIpLimit(request, env, 'register', 5, 60 * 60 * 1000)) {
    return reply(429, { error: 'rate_limited' });
  }
  const body = await readBoundedJson(request, 2048);
  if (!body || Object.keys(body).length !== 3 ||
      typeof body.email !== 'string' || typeof body.authenticationHash !== 'string' ||
      typeof body.wrappedUserKey !== 'string') {
    return reply(400, { error: 'invalid_registration' });
  }
  const email = normalizeEmail(body.email);
  if (!email || email.length > 254 || !emailPattern.test(email)) {
    return reply(400, { error: 'invalid_registration' });
  }
  if (!/^[A-Za-z0-9+/]{43}=$/.test(body.authenticationHash) ||
      !body.wrappedUserKey.startsWith('2.') || body.wrappedUserKey.length > 512) {
    return reply(400, { error: 'invalid_registration' });
  }

  const accountKey = await sha256Hex(email);
  const account = getAccountVault(env, accountKey);
  return account.fetch('https://vault.internal/v1/accounts/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      accountKey,
      authenticationHash: body.authenticationHash,
      wrappedUserKey: body.wrappedUserKey,
    }),
  });
}

async function prelogin(request) {
  const body = await readBoundedJson(request, 1024);
  if (!body || Object.keys(body).length !== 1 || typeof body.email !== 'string') {
    return reply(400, { error: 'invalid_email' });
  }
  const email = normalizeEmail(body.email);
  if (!email || email.length > 254 || !emailPattern.test(email)) {
    return reply(400, { error: 'invalid_email' });
  }
  return reply(200, {
    kdf: 0,
    kdfIterations: publicIterations,
    kdfMemory: null,
    kdfParallelism: null,
  });
}

async function passwordGrant(request, env) {
  if (!await consumeIpLimit(request, env, 'login', 30, 15 * 60 * 1000)) {
    return reply(429, { error: 'rate_limited' });
  }
  const body = await readBoundedJson(request, 4096);
  if (!body || typeof body.username !== 'string' || typeof body.password !== 'string') {
    return reply(400, { error: 'invalid_request' });
  }
  if (body.grant_type !== 'password') return reply(400, { error: 'unsupported_grant_type' });
  const email = normalizeEmail(body.username);
  if (!email || email.length > 254 || !emailPattern.test(email)) return reply(401, { error: 'invalid_credentials' });

  const accountKey = await sha256Hex(email);
  const account = getAccountVault(env, accountKey);
  const result = await account.fetch('https://vault.internal/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      accountKey,
      authenticationHash: body.password,
      now: Date.now(),
      accessLifetimeMs,
      refreshLifetimeMs,
    }),
  });
  return new Response(result.body, { status: result.status, headers: result.headers });
}

async function refreshGrant(request, env) {
  const body = await readBoundedJson(request, 2048);
  const refreshToken = body?.refreshToken ?? body?.refresh_token;
  if (!body || (body.grant_type !== undefined && body.grant_type !== 'refresh_token') ||
      typeof refreshToken !== 'string') {
    return reply(400, { error: 'invalid_request' });
  }
  const accountKey = accountKeyFromToken(refreshToken);
  if (!accountKey || !refreshToken.startsWith('evr1.')) return reply(401, { error: 'invalid_grant' });
  const account = getAccountVault(env, accountKey);
  const result = await account.fetch('https://vault.internal/v1/auth/refresh', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      refreshToken,
      now: Date.now(),
      accessLifetimeMs,
      refreshLifetimeMs,
    }),
  });
  return new Response(result.body, { status: result.status, headers: result.headers });
}

async function authenticatedAccount(request, env) {
  const token = bearerToken(request);
  if (!token) return null;
  const accountKey = accountKeyFromToken(token);
  if (!accountKey || !token.startsWith('ev1.')) return null;
  const account = getAccountVault(env, accountKey);
  const tokenHash = await sha256Hex(token);
  const response = await account.fetch('https://vault.internal/v1/auth/validate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accessHash: tokenHash }),
  });
  if (!response.ok) return null;
  return { account, accountKey };
}

async function vaultRequest(request, env, url) {
  const auth = await authenticatedAccount(request, env);
  if (!auth) return reply(401, { error: 'invalid_or_expired_token' });

  if (url.pathname === '/v1/vault/sync' && request.method === 'GET') {
    const after = Number(url.searchParams.get('after') ?? '0');
    const limit = Number(url.searchParams.get('limit') ?? '100');
    if (!Number.isSafeInteger(after) || after < 0 ||
        !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      return reply(400, { error: 'invalid_sync_cursor' });
    }
    return auth.account.fetch('https://vault.internal/v1/vault/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ after, limit }),
    });
  }

  if (url.pathname === '/v1/vault/records' && request.method === 'GET') {
    const kind = url.searchParams.get('kind');
    if (!['item', 'folder'].includes(kind)) return reply(400, { error: 'invalid_record_kind' });
    return auth.account.fetch('https://vault.internal/v1/vault/list', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind }),
    });
  }

  if (url.pathname === '/v1/vault/records' && request.method === 'POST') {
    const body = await readBoundedJson(request, 128 * 1024 + 2048);
    if (!body || !['item', 'folder'].includes(body.kind) ||
        typeof body.id !== 'string' || typeof body.ciphertext !== 'string' ||
        !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) {
      return reply(400, { error: 'invalid_vault_record' });
    }
    return auth.account.fetch('https://vault.internal/v1/vault/write', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  const recordMatch = /^\/v1\/vault\/records\/(item|folder)\/([a-zA-Z0-9_-]{1,64})$/.exec(url.pathname);
  if (recordMatch && request.method === 'DELETE') {
    const expectedRevision = Number(url.searchParams.get('expectedRevision'));
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
      return reply(400, { error: 'expected_revision_required' });
    }
    return auth.account.fetch('https://vault.internal/v1/vault/write', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: recordMatch[1],
        id: recordMatch[2],
        expectedRevision,
        ciphertext: null,
      }),
    });
  }

  if (url.pathname === '/v1/vault/export' && request.method === 'GET') {
    return auth.account.fetch('https://vault.internal/v1/vault/export');
  }
  if (url.pathname === '/v1/vault/import' && request.method === 'POST') {
    const body = await readBoundedJson(request, 16 * 1024 * 1024 + 1024);
    if (!body) return reply(400, { error: 'invalid_snapshot' });
    return auth.account.fetch('https://vault.internal/v1/vault/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  if (url.pathname === '/v1/auth/logout' && request.method === 'POST') {
    const token = bearerToken(request);
    const accessHash = await sha256Hex(token);
    return auth.account.fetch('https://vault.internal/v1/auth/logout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accessHash }),
    });
  }

  if (url.pathname === '/api/sync' && request.method === 'GET') {
    const after = Number(url.searchParams.get('after') ?? '0');
    const limit = Number(url.searchParams.get('limit') ?? '100');
    if (!Number.isSafeInteger(after) || after < 0 ||
        !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      return reply(400, { error: 'invalid_sync_cursor' });
    }
    const response = await auth.account.fetch('https://vault.internal/v1/vault/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ after, limit }),
    });
    return new Response(response.body, { status: response.status, headers: response.headers });
  }

  if (/^\/api\/(ciphers|folders)\/?$/.test(url.pathname)) {
    const kind = url.pathname.includes('/ciphers') ? 'item' : 'folder';
    const body = request.method === 'GET'
      ? null
      : await readBoundedJson(request, 128 * 1024 + 2048);

    if (request.method === 'GET') {
      const response = await auth.account.fetch('https://vault.internal/v1/vault/list', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind }),
      });
      return new Response(response.body, { status: response.status, headers: response.headers });
    }
    if (request.method === 'POST') {
      const response = await auth.account.fetch('https://vault.internal/v1/vault/write', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind,
          id: body?.id,
          expectedRevision: body?.expectedRevision ?? 0,
          ciphertext: body?.ciphertext,
        }),
      });
      return new Response(response.body, { status: response.status, headers: response.headers });
    }
  }

  const itemMatch = /^\/api\/(ciphers|folders)\/([a-zA-Z0-9_-]{1,64})$/.exec(url.pathname);
  if (itemMatch) {
    const kind = itemMatch[1] === 'ciphers' ? 'item' : 'folder';
    const id = itemMatch[2];
    if (request.method === 'PUT') {
      const body = await readBoundedJson(request, 128 * 1024 + 2048);
      const response = await auth.account.fetch('https://vault.internal/v1/vault/write', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind,
          id,
          expectedRevision: body?.expectedRevision,
          ciphertext: body?.ciphertext,
        }),
      });
      return new Response(response.body, { status: response.status, headers: response.headers });
    }
    if (request.method === 'DELETE') {
      const expectedRevision = Number(url.searchParams.get('expectedRevision'));
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
        return reply(400, { error: 'expected_revision_required' });
      }
      const response = await auth.account.fetch('https://vault.internal/v1/vault/write', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, id, expectedRevision, ciphertext: null }),
      });
      return new Response(response.body, { status: response.status, headers: response.headers });
    }
  }

  if (url.pathname === '/api/vault/export' && request.method === 'GET') {
    const response = await auth.account.fetch('https://vault.internal/v1/vault/export');
    return new Response(response.body, { status: response.status, headers: response.headers });
  }
  if (url.pathname === '/api/vault/import' && request.method === 'POST') {
    const body = await readBoundedJson(request, 16 * 1024 * 1024 + 1024);
    const response = await auth.account.fetch('https://vault.internal/v1/vault/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return new Response(response.body, { status: response.status, headers: response.headers });
  }
  if (url.pathname === '/api/logout' && request.method === 'POST') {
    const token = bearerToken(request);
    const accessHash = await sha256Hex(token);
    const response = await auth.account.fetch('https://vault.internal/v1/auth/logout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accessHash }),
    });
    return new Response(response.body, { status: response.status, headers: response.headers });
  }

  return reply(404, { error: 'not_found' });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let response;
    if (request.method === 'OPTIONS') {
      response = new Response(null, { status: 204 });
      return corsResponse(request, env, response);
    }
    if (url.pathname === '/health' && request.method === 'GET') {
      response = Response.json({ service: 'eaglevault-core', status: 'development', version: 1 });
    } else if (url.pathname === '/v1/accounts' && request.method === 'POST') {
      response = await registerSyntheticAccount(request, env);
    } else if (url.pathname === '/v1/accounts/register' && request.method === 'POST') {
      response = await registerAccount(request, env);
    } else if (url.pathname === '/api/accounts/prelogin' && request.method === 'POST') {
      response = await prelogin(request);
    } else if (url.pathname === '/identity/connect/token' && request.method === 'POST') {
      const contentType = request.headers.get('content-type') ?? '';
      if (contentType.includes('application/x-www-form-urlencoded')) {
        const text = await readBoundedText(request, 4096);
        if (text === null) {
          response = reply(413, { error: 'request_too_large' });
        } else {
          const form = new URLSearchParams(text);
          const body = Object.fromEntries(form.entries());
          response = body.grant_type === 'refresh_token'
            ? await refreshGrant(new Request(request.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), env)
            : await passwordGrant(new Request(request.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), env);
        }
      } else {
        response = await reply(415, { error: 'unsupported_media_type' });
      }
    } else if (url.pathname === '/v1/auth/login' && request.method === 'POST') {
      const body = await readBoundedJson(request, 2048);
      if (!body || typeof body.email !== 'string' ||
          typeof body.authenticationHash !== 'string') {
        response = reply(400, { error: 'invalid_request' });
      } else {
        response = await passwordGrant(new Request(request.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            username: body.email,
            password: body.authenticationHash,
            grant_type: 'password',
          }),
        }), env);
      }
    } else if (url.pathname === '/v1/auth/refresh' && request.method === 'POST') {
      response = await refreshGrant(request, env);
    } else {
      response = await vaultRequest(request, env, url);
    }
    return corsResponse(request, env, response);
  }
};

export class VaultStore {
  constructor(state) {
    this.storage = state.storage;
    if (state.storage) {
      const transaction = callback => state.storage.transactionSync(callback);
      this.accounts = new AccountStore(state.storage.sql, transaction);
    }
  }
  async fetch(request) {
    if (!this.storage || !request) return reply(501, { error: 'not_implemented' });
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/v1/accounts') {
      return insertSyntheticAccount(this.storage, await request.json());
    }
    const body = request.method === 'POST' ? await readBoundedJson(request, 16 * 1024 * 1024 + 4096) : null;
    if (request.method === 'POST' && !body) return reply(400, { error: 'invalid_request' });

    if (url.pathname === '/v1/accounts/register' && request.method === 'POST') {
      return this.accounts.register({ ...body, now: Date.now() });
    }
    if (url.pathname === '/v1/auth/login' && request.method === 'POST') {
      return this.accounts.login(body);
    }
    if (url.pathname === '/v1/auth/refresh' && request.method === 'POST') {
      return this.accounts.refresh(body);
    }
    if (url.pathname === '/v1/auth/validate' && request.method === 'POST') {
      return this.accounts.validateAccess(body.accessHash, Date.now())
        ? reply(200, { valid: true })
        : reply(401, { error: 'invalid_or_expired_token' });
    }
    if (url.pathname === '/v1/auth/logout' && request.method === 'POST') {
      this.accounts.logout(body.accessHash);
      return reply(200, { status: 'logged_out' });
    }
    if (url.pathname === '/v1/vault/write' && request.method === 'POST') {
      try {
        const result = this.accounts.vault.write(body);
        return result.conflict
          ? reply(409, { error: 'conflict', revision: result.revision })
          : reply(body.expectedRevision === 0 ? 201 : 200, { revision: result.revision });
      } catch (error) {
        if (error instanceof TypeError || error instanceof RangeError) {
          return reply(400, { error: 'invalid_vault_record' });
        }
        throw error;
      }
    }
    if (url.pathname === '/v1/vault/sync' && request.method === 'POST') {
      try {
        return reply(200, this.accounts.vault.sync(body.after, body.limit));
      } catch (error) {
        if (error instanceof TypeError || error instanceof RangeError) {
          return reply(400, { error: 'invalid_sync_cursor' });
        }
        throw error;
      }
    }
    if (url.pathname === '/v1/vault/list' && request.method === 'POST') {
      try {
        return reply(200, { records: this.accounts.vault.list(body.kind) });
      } catch (error) {
        if (error instanceof TypeError) return reply(400, { error: 'invalid_record_kind' });
        throw error;
      }
    }
    if (url.pathname === '/v1/vault/export' && request.method === 'GET') {
      return reply(200, this.accounts.vault.exportSnapshot());
    }
    if (url.pathname === '/v1/vault/import' && request.method === 'POST') {
      try {
        this.accounts.vault.importSnapshot(body);
        return reply(200, { status: 'imported' });
      } catch (error) {
        if (error instanceof TypeError) return reply(400, { error: 'invalid_snapshot' });
        throw error;
      }
    }
    return reply(404, { error: 'not_found' });
  }
}

export class RateLimitStore {
  constructor(state) {
    this.storage = state.storage;
    if (state.storage) {
      this.limiter = new RateLimitStateStore(
        state.storage.sql,
        callback => state.storage.transactionSync(callback)
      );
    }
  }

  async fetch(request) {
    if (!this.limiter || request.method !== 'POST' || new URL(request.url).pathname !== '/consume') {
      return reply(404, { error: 'not_found' });
    }
    const body = await readBoundedJson(request, 1024);
    if (!body || !Number.isSafeInteger(body.now) || !Number.isSafeInteger(body.windowMs) ||
        !Number.isSafeInteger(body.maxRequests) || body.windowMs < 1 ||
        body.maxRequests < 1 || body.maxRequests > 1000) {
      return reply(400, { error: 'invalid_rate_limit' });
    }
    return this.limiter.consume(body)
      ? reply(200, { allowed: true })
      : reply(429, { error: 'rate_limited' });
  }
}
