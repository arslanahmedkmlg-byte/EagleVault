import { registerSyntheticAccount, insertSyntheticAccount } from './registration.mjs';
import { SqliteVault } from './sqlite-vault.mjs';

// EagleVault Core prototype. No authentication or vault writes are exposed.
// All storage-specific behavior stays behind this Durable Object boundary.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') {
      return Response.json({ service: 'eaglevault-core', status: 'development', version: 1 }, {
        headers: { 'cache-control': 'no-store' }
      });
    }
    if (url.pathname === '/v1/accounts' && request.method === 'POST') {
      return registerSyntheticAccount(request, env);
    }
    return Response.json({ error: 'not_implemented', message: 'Authentication and vault operations are disabled until security validation.' }, { status: 501, headers: { 'cache-control': 'no-store' } });
  }
};

export class VaultStore {
  constructor(state) {
    this.storage = state.storage;
    if (state.storage) {
      this.records = new SqliteVault(state.storage.sql, callback => state.storage.transactionSync(callback));
    }
  }
  async fetch(request) {
    if (this.storage && request?.method === 'POST' && new URL(request.url).pathname === '/v1/accounts') {
      return insertSyntheticAccount(this.storage, await request.json());
    }
    return Response.json({ error: 'not_implemented' }, { status: 501 });
  }
}
