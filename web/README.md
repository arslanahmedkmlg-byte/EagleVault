# Web client

The Proton Pass Web application and its shared workspace packages are imported in upstream/. The unrelated Proton Web applications, browser extension and desktop app are excluded.

EagleVault-specific transport: src/api/vaultwarden-client.ts.

Current transport operations:
- GET /api/sync
- POST /api/ciphers
- PUT /api/ciphers/{id}
- DELETE /api/ciphers/{id}
- GET /api/folders
- POST /api/folders
- PUT /api/folders/{id}
- DELETE /api/folders/{id}

The transport does not perform login, token refresh, crypto, data mapping, persistence or UI integration. The caller supplies a current access token. These are deliberate seams pending source audit and API contract tests.

Run transport tests from repository root:
node --experimental-strip-types --test tests/contracts/vaultwarden-client.test.mjs

The full Proton Web app is not yet built or wired to the new transport. Source commit: docs/UPSTREAM-IMPORTS.md.

## Bitwarden-compatible crypto

The adapter in `src/crypto` uses the pinned official `@bitwarden/sdk-internal` GPL-3.0 package. Call `initializeBitwardenCryptoSdk()` once during browser application startup before using `BitwardenCryptoProvider`. See [the SDK integration notes](../docs/CRYPTO-SDK-INTEGRATION.md).

This layer is not yet wired into Proton's login screen or vault repository. Do not store real credentials until that integration and Android parity are verified.
