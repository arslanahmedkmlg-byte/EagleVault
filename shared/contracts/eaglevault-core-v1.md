# EagleVault Core portable protocol (draft v0.1)

The planned API origin is `https://api.eaglevault.eaglenet.asia`. The planned Web origin is `https://eaglevault.eaglenet.asia` when Web is deployed. The API origin remains configurable in the clients. Clients must never call Cloudflare Durable Object APIs directly. Hosting changes must not alter client endpoint contracts.

## Initial production and future VPS migration

The initial release hosts the Web app in Workers Static Assets, the API on Workers, and encrypted records in SQLite-backed Durable Objects. Independent backup storage remains to be selected. If the backend later moves to a Linux VPS, distribute the standalone server as a Debian package. Use the same HTTP contract and versioned encrypted export format as the Cloudflare adapter. The packaged server needs its own SQLite driver, service unit, configuration, writable database directory and schema migration path. Verify installation, restart, upgrade, removal, encrypted restore and rollback on the target Debian release and architecture. Determine the VPS host details before packaging. EC2 remains the development host.

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

## Internal storage semantics

Each account gets one database selected from authenticated identity when the public routes are implemented. A record is identified by its kind (item or folder) and stable ID within that account. Create uses expected revision zero. Updates and deletes supply the last observed record revision. A mismatch returns the current revision without incrementing the account clock. Tombstone IDs are reserved permanently in this initial storage model.

The record and account clock update in one transaction. Incremental sync returns the latest version of each changed record, including tombstones, ordered by revision. It advances an exclusive cursor to the last returned revision when more records remain, or to the current account revision on the final page. This is a state feed and may coalesce multiple mutations to the same record. Consumers should apply a record only when its revision exceeds the locally applied revision for that record.

This storage shape does not define the HTTP wire format or expose a route. Account scoping, replay handling, envelope validation, retention, total quota, password/session design and versioned exports remain open. Web currently delegates its cryptography to Bitwarden SDK. Android uses compatible transport DTOs only. Both clients need matching encrypted representations and shared vectors before enabling writes.

## Threat model for the first authenticated slice

- Treat the browser and Android device as the only holders of plaintext and unwrapped vault keys. An injected script, compromised dependency, or unlocked compromised device can access those values. Test a restrictive browser CSP, disable vault telemetry and clear unlocked state on lock and logout.
- Treat Core and its backups as potentially readable after a server compromise. Encrypt item and folder contents on the client. Document the metadata left visible, including record count, sizes and revision activity. Audit password-verification and wrapped-key theft for offline guessing risk before finalizing authentication.
- Resolve one internal account ID per authenticated request and route from that ID. An ID in a URL, cursor or body confers no access. Test cross-account attempts with valid sessions from a different account. Sessions must expire and be revocable.
- Treat clients as capable of replaying, racing or aborting writes. Check expected revisions in the same transaction that allocates a new version. Define duplicate-operation semantics before exposing mutation routes. Test lost responses and interleaved clients.
- Treat returned ciphertext and restore input as untrusted. Verify it with the SDK before rendering, reject tampering, and preserve an encrypted recovery path. Test restore to an independent database and keep production release gated on the result.

## Security gate
Until authentication, encryption interoperability, storage consistency, recovery and end-to-end tests pass, backend vault routes remain disabled. Do not use real credentials.
