# EagleVault Core (Cloudflare prototype)

This is the provider-specific Cloudflare adapter for the future portable EagleVault Core protocol. It is **not a working password manager**: the default Worker returns HTTP 501 for account and vault routes. A synthetic-only configuration enables a local vertical slice. Do not deploy for real credentials.

- Runtime: Cloudflare Workers.
- Storage: an internal SQLite-backed Durable Object repository with conditional writes, tombstones and revision-based sync. The default HTTP handler exposes only the health check.
- `/health` is a development-only endpoint.
- All clients must use the portable HTTP protocol rather than Durable Objects APIs.
- Keep cryptographic operations in reviewed client libraries, not a custom server algorithm.
- Do not introduce secrets or master passwords into server logs.
- Migration requirement: versioned schema, portable export/import, integrity checks and tested rollback before any production data.

Run local contract and SQLite repository tests with Node 24: `node --test test/*.test.mjs`.

Deployment requires explicit Cloudflare account configuration and authorization. No production hostname is configured here.

## Synthetic staging contract

The local test harness uses dummy credentials. To exercise the actual Worker
in a local runtime, supply `SYNTHETIC_STAGING=enabled`, a synthetic 32-byte
hex `STAGING_PEPPER`, and a synthetic `STAGING_REGISTRATION_CODE`. Set
`STAGING_WEB_ORIGIN` for cross-origin browser calls. Use HTTPS and keep these
values in local runtime configuration or secret bindings. The historical
Web bootstrap route is `?eaglevault=1`.

See the shared Core protocol for session semantics and the deployment gates.
