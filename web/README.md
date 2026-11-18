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

The REST transport remains separate from identity and cryptography: it accepts an access-token callback and exposes sync/cipher/folder calls. Identity pre-login/password grant lives in src/auth and src/api/vaultwarden-identity-client.ts; Bitwarden-compatible KDF and field crypto live in src/crypto. Cipher decryption/mapping, secure session persistence, token refresh lifecycle and CRUD UI remain incomplete.

Run transport tests from repository root:
node --experimental-strip-types --test tests/contracts/vaultwarden-client.test.mjs

The Proton Pass Web application is now wired to an isolated EagleVault login/sync mode. Source commit: docs/UPSTREAM-IMPORTS.md. See docs/WEB-INTEGRATION-AUDIT.md for the current integration boundary.

## Bitwarden-compatible crypto

The adapter in `src/crypto` uses the pinned official `@bitwarden/sdk-internal` GPL-3.0 package. Call `initializeBitwardenCryptoSdk()` once during browser application startup before using `BitwardenCryptoProvider`. See [the SDK integration notes](../docs/CRYPTO-SDK-INTEGRATION.md).

The Bitwarden SDK is initialized by the EagleVault login flow before password authentication. Vault decryption, secure session persistence and Android parity remain incomplete; do not use production credentials.
# EagleVault Web application mode

The Proton Pass Web application is the presentation foundation. The upstream default mode remains unchanged when no query parameter is supplied.

## Start EagleVault mode

From `web/upstream`, install the pinned workspace dependencies and start the Proton Pass Web dev server:

```sh
corepack pnpm install --filter proton-pass... --frozen-lockfile
corepack pnpm --filter proton-pass start
```

Open the dev-server URL with `?eaglevault=1` appended. The EagleVault mode renders the dedicated login panel inside the Proton Pass application shell and skips Proton's account/session provider tree, Redux store/sagas, Proton Pass crypto worker exposure, API exposure, Sentry initialization, and connectivity initialization.

The login form accepts the Vaultwarden base URL, email, master password, and an optional authenticator-app code. It runs the Bitwarden SDK WASM initialization, pre-login KDF lookup, identity password grant, and initial sync/folder requests. The 8.23 MiB Bitwarden WASM file is emitted as a separate asset and fetched when SDK initialization runs; webpack reports asset/entrypoint size warnings but the build succeeds.

## Current limitations

- Only the authenticator-app TOTP 2FA provider is exposed in this initial form. Other 2FA methods and provider negotiation are not implemented.
- Tokens are memory-only. Reloading the page requires signing in again.
- The screen reports encrypted item and folder counts; it does not yet decrypt the protected user key or cipher fields.
- No cipher CRUD UI, Proton item model mapper, attachment handling, refresh-token lifecycle, lock/unlock flow, or offline vault is connected.
- Treat this as a development integration milestone only. Do not use a production vault until cross-platform crypto, secure session storage, decryption, CRUD, and end-to-end tests are complete.

## Dependency bootstrap note

The Proton Web clone's default npm scope configuration points some @protontech packages at Proton's private GitLab registry. That registry was unreachable from the build device. For the verified local build, dependencies were installed with a temporary @protontech:registry=https://registry.npmjs.org/ override and a filtered --lockfile=false --ignore-scripts install; the original .npmrc was restored afterward. This fallback is for reproducing the current development build only. Release builds should use the committed pnpm lockfile with the normal frozen-lockfile install and an accessible configured registry.
