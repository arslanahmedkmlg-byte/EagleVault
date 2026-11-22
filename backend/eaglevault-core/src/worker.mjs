import { DurableObject } from 'cloudflare:workers';
import { AccountStore } from './account-store.mjs';
import { checkProof, createAuthenticatedHandler } from './auth-http.mjs';
import core, { VaultStore as VaultRepository } from './index.mjs';
import { json } from './vault-http.mjs';

export class VaultStore extends DurableObject {
  #accounts;

  constructor(ctx, env) {
    super(ctx, env);
    this.repository = new VaultRepository(ctx);
  }

  #accountStore() {
    const { storage } = this.ctx;
    return this.#accounts ??= new AccountStore(
      (sql, ...params) => storage.sql.exec(sql, ...params).toArray(),
      callback => storage.transactionSync(callback)
    );
  }

  async register(proofTag, wrappedKey) {
    return this.#accountStore().register(proofTag, wrappedKey);
  }

  async login(proof, account, digests, now) {
    return this.#accountStore().login(
      expected => checkProof(this.env.STAGING_PEPPER, account, proof, expected), digests, now
    );
  }

  async refresh(previousDigest, digests, now) {
    return this.#accountStore().refresh(previousDigest, digests, now);
  }

  async authorize(digest, now) {
    return this.#accountStore().authorize(digest, now);
  }

  async logout(refreshDigest) {
    return this.#accountStore().logout(refreshDigest);
  }

  async writeRecord(mutation) {
    return this.repository.writeRecord(mutation);
  }

  async syncRecords(options) {
    return this.repository.syncRecords(options);
  }

  async fetch() {
    return this.repository.fetch();
  }
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (env.SYNTHETIC_STAGING !== 'enabled' || !path.startsWith('/v1/')) return core.fetch(request, env);
    if (!/^[0-9a-f]{64}$/.test(env.STAGING_PEPPER ?? '')) return json({ error: 'staging_unavailable' }, 503);

    const origin = request.headers.get('origin');
    if (origin !== null && (!env.STAGING_WEB_ORIGIN || origin !== env.STAGING_WEB_ORIGIN)) {
      return json({ error: 'origin_denied' }, 403);
    }
    const cors = origin ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {};
    if (request.method === 'OPTIONS' && origin) {
      return new Response(null, { status: 204, headers: {
        ...cors,
        'access-control-allow-methods': 'GET, POST, PUT',
        'access-control-allow-headers': 'Authorization, Content-Type'
      } });
    }

    const handler = createAuthenticatedHandler({
      storeForAccount: account => env.VAULTS.getByName(account),
      pepper: env.STAGING_PEPPER,
      registrationCode: env.STAGING_REGISTRATION_CODE
    });
    const response = await handler(request);
    for (const [name, value] of Object.entries(cors)) response.headers.set(name, value);
    return response;
  }
};
