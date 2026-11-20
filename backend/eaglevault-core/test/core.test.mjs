import test from 'node:test';
import assert from 'node:assert/strict';
import core, { VaultStore } from '../src/index.mjs';

function rateLimits(status = 200) {
  return {
    idFromName: name => name,
    get: () => ({ fetch: async () => new Response(null, { status }) }),
  };
}

test('health is available and explicitly development-only', async () => {
  const response = await core.fetch(new Request('https://api.example.test/health'));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'development');
});
test('vault APIs require a valid authenticated session', async () => {
  const response = await core.fetch(new Request('https://api.example.test/api/ciphers', { method: 'POST' }));
  assert.equal(response.status, 401);
});
test('Durable Object does not expose unauthenticated data', async () => {
  const response = await new VaultStore({}, {}).fetch();
  assert.equal(response.status, 501);
});

test('account registration and synthetic registration stay disabled by default', async () => {
  const registration = await core.fetch(new Request('https://api.example.test/v1/accounts/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'user@example.test',
      authenticationHash: 'A'.repeat(43) + '=',
      wrappedUserKey: '2.wrapped-key',
    }),
  }));
  assert.equal(registration.status, 403);
  assert.deepEqual(await registration.json(), { error: 'registration_disabled' });

  const synthetic = await core.fetch(new Request('https://api.example.test/v1/accounts', {
    method: 'POST',
  }));
  assert.equal(synthetic.status, 404);
});

test('staging Core fails closed and requires a rate-limited staging access key', async () => {
  const missingSecret = await core.fetch(
    new Request('https://api.example.test/api/accounts/prelogin', { method: 'POST' }),
    { STAGING_MODE: 'true' },
  );
  assert.equal(missingSecret.status, 503);

  const env = {
    STAGING_MODE: 'true',
    STAGING_ACCESS_KEY: 'A'.repeat(43),
    RATE_LIMITS: rateLimits(),
  };
  const unauthorized = await core.fetch(
    new Request('https://api.example.test/api/accounts/prelogin', { method: 'POST' }),
    env,
  );
  assert.equal(unauthorized.status, 401);

  const authorized = await core.fetch(new Request('https://api.example.test/api/accounts/prelogin', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-eaglevault-staging-key': env.STAGING_ACCESS_KEY,
    },
    body: JSON.stringify({ email: 'user@example.test' }),
  }), env);
  assert.equal(authorized.status, 200);

  const rateLimited = await core.fetch(
    new Request('https://api.example.test/api/accounts/prelogin', { method: 'POST' }),
    { ...env, RATE_LIMITS: rateLimits(429) },
  );
  assert.equal(rateLimited.status, 429);
});

test('public registration can be enabled without a staging secret and retains rate limits', async () => {
  const registrations = [];
  const env = {
    REGISTRATION_ENABLED: 'true',
    RATE_LIMITS: rateLimits(),
    VAULTS: {
      idFromName: name => name,
      get: () => ({ fetch: async (_url, init) => {
        registrations.push(JSON.parse(init.body));
        return Response.json({ status: 'created' }, { status: 201 });
      } }),
    },
  };
  const result = await core.fetch(new Request('https://api.example.test/v1/accounts/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://eaglevault.eaglenet.asia' },
    body: JSON.stringify({
      email: 'public-user@example.test',
      authenticationHash: 'A'.repeat(43) + '=',
      wrappedUserKey: '2.synthetic-wrapped-key',
    }),
  }), env);
  assert.equal(result.status, 201);
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].email, 'public-user@example.test');
  const limited = await core.fetch(new Request('https://api.example.test/v1/accounts/register', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  }), { ...env, RATE_LIMITS: rateLimits(429) });
  assert.equal(limited.status, 429);
});
