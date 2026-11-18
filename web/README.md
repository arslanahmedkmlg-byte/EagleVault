# Web integration

The first transport milestone is implemented in src/api/vaultwarden-client.ts. It currently covers:
- GET /api/sync
- POST /api/ciphers
- PUT /api/ciphers/{id}
- DELETE /api/ciphers/{id}
- GET /api/folders
- POST /api/folders
- PUT /api/folders/{id}
- DELETE /api/folders/{id}

The transport does not perform login, token refresh, crypto, data mapping, persistence or UI integration. The caller supplies a current access token. These are deliberate seams: identity and crypto must be verified against the pinned server/client implementation before they are added.

Run the current transport tests from repository root:
node --experimental-strip-types --test tests/contracts/vaultwarden-client.test.mjs
