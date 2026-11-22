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

## Draft EagleVault-native vault transport

The local contract harness uses the following endpoints. This is a new transport
for opaque encrypted records. The Bitwarden-compatible routes above remain a
reference for the older prototypes. The synthetic staging authentication and ciphertext profile are described below.

- `GET /v1/vault/sync?after=0&limit=25` returns `{records,cursor,hasMore}`.
  Each record contains `id`, `ciphertext` and `revision`. Limits range from 1
  to 100. Continue with the returned cursor and apply results in order by ID
  and revision. The feed contains the latest state of each record, so it does
  not guarantee delivery of every intermediate edit.
- `PUT /v1/vault/records/{id}` accepts JSON `{ciphertext,expectedRevision}`
  over HTTPS. IDs use lowercase UUID syntax. Revision zero creates a new
  record, and subsequent writes must supply the last known revision.
  A null ciphertext deletes an existing record and emits a tombstone.
  Tombstones reserve IDs. Ciphertext is limited to 65,536 UTF-8 bytes.
- Successful writes return HTTP 200 with `{status:"saved",revision}`. A
  stale revision returns HTTP 409 with `{status:"conflict",revision}`.
  After a lost response, sync and reconcile before retrying.
- Storage scope comes from the verified session. Request bodies and URLs
  carry no account identifier. Errors omit request contents and use
  `{error}`. Private responses use `Cache-Control: no-store`.

The default Worker configuration leaves these routes disabled. Synthetic staging
can mount them with the authentication flow below.

## Synthetic staging authentication and encrypted records

The contract above is mounted only when the Worker has
`SYNTHETIC_STAGING=enabled` and a valid 32-byte hex `STAGING_PEPPER`.
`STAGING_REGISTRATION_CODE` enables account creation, and
`STAGING_WEB_ORIGIN` allows one exact browser origin.

| Method and path | JSON request | Success |
| --- | --- | --- |
| GET /v1/auth/kdf | No body | Fixed Argon2id profile, 3 iterations, 64 MiB, 4 lanes |
| POST /v1/auth/register | `email`, `proof`, `wrappedKey`, `registrationCode` | 201, account created |
| POST /v1/auth/login | `email`, `proof` | `accessToken`, `refreshToken`, `expiresAt`, `wrappedKey` |
| POST /v1/auth/refresh | `refreshToken` | New access and refresh tokens and `expiresAt` |
| POST /v1/auth/logout | `refreshToken` | Revokes its session, including the current access token |

Normalize email by trimming and lowercasing. Derive the master key and
the Bitwarden legacy authentication hash locally. The proof is sensitive
and reusable, so send it over HTTPS and exclude it from logs. The Worker
stores a keyed digest of the proof and a wrapped 64-byte user key. Access
tokens expire after 15 minutes, and refresh sessions have an absolute
seven-day lifetime. Successful refresh consumes the old refresh token
and replaces the access token atomically. If the client loses the
refresh response, it must sign in again.

Encrypt the whole record with the SDK's AES-256-CBC-HMAC EncString
primitive using the user's vault key. The decrypted JSON contains
`version: 1`, `id`, `kind`, `name`, `username`, `password`, `url`,
`notes`, and `folderId`. Supported kinds are `login`, `note`, and
`folder`. Text fields are strings, including empty strings. The envelope
ID must equal the authenticated payload ID after decryption. This is
an EagleVault record envelope using Bitwarden crypto primitives.

The staging pepper also derives account routing names and authenticates
session token routing. Changing it requires an account migration plan.
The fixed KDF profile, invite registration, and per-account attempt
limit are synthetic staging controls. Production account recovery,
abuse prevention, password changes, and external security review remain
release gates.
