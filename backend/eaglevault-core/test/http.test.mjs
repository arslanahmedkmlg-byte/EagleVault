import assert from 'node:assert/strict';
import test from 'node:test';
import core from '../src/index.mjs';

const origin = 'https://eaglevault.eaglenet.asia';

test('allows the configured Web origin and emits non-cacheable API headers', async () => {
  const response = await core.fetch(new Request('https://api.eaglevault.eaglenet.asia/health', {
    headers: { origin },
  }), { CORS_ORIGINS: origin });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('vary') ?? '', /origin/i);
});

test('rejects disallowed browser origins', async () => {
  const response = await core.fetch(new Request('https://api.eaglevault.eaglenet.asia/health', {
    headers: { origin: 'https://attacker.example' },
  }), { CORS_ORIGINS: origin });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'origin_not_allowed' });
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('preflight permits only expected methods and headers', async () => {
  const valid = await core.fetch(new Request('https://api.eaglevault.eaglenet.asia/v1/vault', {
    method: 'OPTIONS',
    headers: {
      origin,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'authorization, content-type',
    },
  }), { CORS_ORIGINS: origin });

  assert.equal(valid.status, 204);
  assert.equal(valid.headers.get('access-control-allow-origin'), origin);
  assert.match(valid.headers.get('access-control-allow-methods') ?? '', /POST/);
  assert.doesNotMatch(valid.headers.get('access-control-allow-headers') ?? '', /x-eaglevault-staging-key/i);
  assert.equal(valid.headers.get('strict-transport-security'), 'max-age=31536000');

  const invalid = await core.fetch(new Request('https://api.eaglevault.eaglenet.asia/v1/vault', {
    method: 'OPTIONS',
    headers: {
      origin,
      'access-control-request-method': 'PATCH',
      'access-control-request-headers': 'authorization',
    },
  }), { CORS_ORIGINS: origin });

  assert.equal(invalid.status, 403);
});

test('staging preflight permits only the staging key header in staging mode', async () => {
  const response = await core.fetch(new Request('https://staging.example.test/v1/vault', {
    method: 'OPTIONS',
    headers: {
      origin: 'https://eaglevault-web-staging.example.workers.dev',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'authorization, content-type, x-eaglevault-staging-key',
    },
  }), {
    CORS_ORIGINS: 'https://eaglevault-web-staging.example.workers.dev',
    STAGING_MODE: 'true',
  });
  assert.equal(response.status, 204);
  assert.match(response.headers.get('access-control-allow-headers') ?? '', /x-eaglevault-staging-key/i);
});
