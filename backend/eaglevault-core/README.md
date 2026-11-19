# EagleVault Core (Cloudflare prototype)

Core runs on Cloudflare Workers. Login, sync and vault writes return HTTP 501. Synthetic registration is disabled unless the runtime receives a staging secret. The internal SQLite store uses an injected transaction function and SQL executor, so it can also run with a standalone SQLite host. It treats ciphertext as opaque and relies on the client crypto layer to produce it.

- Runtime: Cloudflare Workers.
- Database target: SQLite-backed Durable Objects; no D1 or R2 bindings.
- `/health` is a development-only endpoint.
- All clients must use the portable HTTP protocol rather than Durable Objects APIs.
- Keep cryptographic operations in reviewed client libraries, not a custom server algorithm.
- Do not introduce secrets or master passwords into server logs.
- Migration requirement: versioned schema, portable export/import, integrity checks and tested rollback before any production data.

Run local contract tests: `node --test test/*.test.mjs`.

The Cloudflare Worker is configured for the custom domain `api.eaglevault.eaglenet.asia`. The currently deployed Worker exposes development health. Public signup and login await client integration and release validation.

## Synthetic registration

`POST /v1/accounts` accepts JSON with exactly `email`, `authenticationHash` and `wrappedUserKey`. It is available only to a caller with the 32-byte hex `TEST_REGISTRATION_TOKEN` staging secret, and accepts only reserved `.test` email addresses. Keep that secret out of clients and production. The test protocol uses a fixed Bitwarden SDK PBKDF2-SHA256 client KDF of 600,000 iterations and a type-2 wrapped user key. Core stores the wrapped key and a randomly salted verifier derived from the authentication hash. Login and session issuance remain unimplemented.

With the pinned Web and Core dependencies installed, run `node --experimental-strip-types backend/eaglevault-core/integration/registration.mjs` from the repository root. The test runs the Worker and SQLite Durable Object locally and uses the real pinned Web crypto SDK.
