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
    return Response.json({ error: 'not_implemented', message: 'Authentication and vault operations are disabled until security validation.' }, { status: 501, headers: { 'cache-control': 'no-store' } });
  }
};

export class VaultStore {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }
  async fetch() {
    return Response.json({ error: 'not_implemented' }, { status: 501 });
  }
}
