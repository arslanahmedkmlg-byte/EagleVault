import test from 'node:test';
import assert from 'node:assert/strict';
import core, { VaultStore } from '../src/index.mjs';
test('health is available and explicitly development-only', async () => {
  const response = await core.fetch(new Request('https://api.example.test/health'));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'development');
});
test('vault writes fail closed', async () => {
  const response = await core.fetch(new Request('https://api.example.test/api/ciphers', { method: 'POST' }));
  assert.equal(response.status, 501);
});
test('Durable Object does not expose unauthenticated data', async () => {
  const response = await new VaultStore({}, {}).fetch();
  assert.equal(response.status, 501);
});
