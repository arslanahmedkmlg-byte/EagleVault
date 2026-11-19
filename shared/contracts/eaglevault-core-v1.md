# EagleVault Core portable protocol (draft v0.1)

Client-facing origin is configurable, e.g. `https://api.vault.eaglenet.asia`. Clients must never call Cloudflare Durable Object APIs directly. Hosting changes must not alter client endpoint contracts.

## Existing compatibility target
- `POST /api/accounts/prelogin`: account KDF discovery.
- `POST /identity/connect/token`: authentication and token refresh.
- `GET /api/sync`: encrypted vault synchronization.
- `GET/POST /api/ciphers`, `PUT/DELETE /api/ciphers/{id}`: encrypted item CRUD.
- `GET/POST /api/folders`, `PUT/DELETE /api/folders/{id}`: folders.

This is an endpoint inventory, not a complete Bitwarden protocol specification. Payload schemas, revision/conflict semantics, authorization, recovery and error codes require compatibility tests before implementation.

## Portability requirements
- No Cloudflare-specific URLs or credentials in Web/Android client code.
- Portable stable IDs and versioned export schema for users, encrypted records, folders, key derivation metadata and revision counters.
- Server must not receive plaintext master passwords or decrypted vault fields.
- Explicit per-account authorization, token expiry/rotation, rate limits and audit logging without secrets.
- Consistent concurrent updates and deterministic conflict behavior.
- Independent encrypted backups with restoration tests beyond provider point-in-time recovery.
- Document data migrations and session invalidation when moving providers.

## Security gate
Until authentication, encryption interoperability, storage consistency, recovery and end-to-end tests pass, backend vault routes remain disabled. Do not use real credentials.
