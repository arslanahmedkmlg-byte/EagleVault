# Vaultwarden API surface — Phase 1

Source-audited starting point, not a complete OpenAPI specification.
Audited local source on 2026-11-19:
- vaultwarden/src/api/core/ciphers.rs
- vaultwarden/src/api/core/folders.rs

Observed operations:
- GET /api/sync — sync snapshot; server route is GET /sync mounted below API prefix.
- POST /api/ciphers — create cipher (CipherData).
- PUT /api/ciphers/{id} and compatibility POST /api/ciphers/{id} — update cipher.
- DELETE /api/ciphers/{id} — delete cipher.
- GET /api/folders — list folders.
- POST /api/folders — create folder (FolderData).
- PUT /api/folders/{id} and compatibility POST /api/folders/{id} — update folder.
- DELETE /api/folders/{id} — delete folder.

This is not an exhaustive endpoint list. Use the pinned server route definitions as source of truth. CipherData has legacy field-level properties and a data field for newer blob-encrypted ciphers; do not assume they are interchangeable. Never send plaintext vault secrets. Verify identity/token endpoints and refresh semantics from the exact Vaultwarden revision before implementing authentication. Contract-test casing, status codes, error envelopes and sync payloads against a disposable server.
