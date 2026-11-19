# EagleVault Core (Cloudflare prototype)

This is the provider-specific Cloudflare adapter for the future portable EagleVault Core protocol. It is **not a working password manager**: registration, authentication, sync, vault writes and all credential handling deliberately return HTTP 501 until security gates pass. Do not deploy for real credentials.

- Runtime: Cloudflare Workers.
- Database target: SQLite-backed Durable Objects; no D1 or R2 bindings.
- `/health` is a development-only endpoint.
- All clients must use the portable HTTP protocol rather than Durable Objects APIs.
- Keep cryptographic operations in reviewed client libraries, not a custom server algorithm.
- Do not introduce secrets or master passwords into server logs.
- Migration requirement: versioned schema, portable export/import, integrity checks and tested rollback before any production data.

Run local contract tests: `node --test test/*.test.mjs`.

Deployment requires explicit Cloudflare account configuration and authorization. No production hostname is configured here.
