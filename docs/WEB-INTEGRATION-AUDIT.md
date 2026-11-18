# Proton Pass Web integration source audit

Audit target: imported Proton Pass Web client under web/upstream, reviewed against EagleVault's Vaultwarden transport and Bitwarden SDK crypto adapters.

## Findings

### 1. App bootstrap is Proton-account coupled

File: applications/pass/src/app/App.tsx

The app currently constructs its API client with Proton's createApi and ProtonConfig. The API factory in packages/pass/lib/api/factory.ts wraps configureApi and protonFetch, adds Proton-specific API state handling, date-header requirements, refresh behavior, and session authorization. App.tsx also exposes this API globally to the Pass UI and creates the Pass crypto worker.

The same bootstrap constructs createAuthStore(createSecureSessionStorage()) and calls createPassCrypto(core, store). The auth and crypto objects are not merely UI services; they are central dependencies of the app.

### 2. The current login screen is not a local username/password screen

Files:
- applications/pass/src/app/Auth/AuthServiceProvider.tsx
- applications/pass/src/app/Views/Public/Lobby.tsx
- applications/pass/src/app/Views/PublicRouter.tsx
- packages/pass/components/Layout/Lobby/LobbyContent.tsx
- packages/pass/lib/auth/service.ts

AuthServiceProvider creates the Proton Pass AuthService and calls authService.init() during startup. LobbyContent's default action invokes the Proton account/fork flow; account creation also redirects through the Proton account flow. A Vaultwarden login must replace this flow with the EagleVault pre-login + Bitwarden KDF + identity-token process already implemented under web/src/auth.

The Proton AuthStore stores fields such as UID, UserID, LocalID, AccessToken, RefreshToken, lock state, offline-password components, and encrypted session state. Some fields can be repurposed conceptually, but Proton session-resume, fork, cookie-auth, and local-key APIs cannot be assumed compatible with Vaultwarden tokens.

### 3. Proton's crypto worker is deeply tied to Proton account keys

Files:
- applications/pass/src/app/App.tsx
- packages/pass/lib/crypto/pass-crypto.ts
- packages/pass/types/crypto/pass-crypto.ts
- packages/pass/lib/core/core.worker.service.ts

PassCryptoWorker hydration expects a Proton User, Proton Addresses, address keys, user keys, groups, and optional crypto snapshots. It exposes Proton-specific operations for vaults, shares, item revisions, folder keys, group invites, secure links, and native messaging.

This is not a replaceable endpoint URL. It must be replaced by a Bitwarden SDK-backed crypto/repository adapter, or narrowed to a compatible personal-vault subset before reusing the UI.

### 4. The UI data model is also different

Files:
- packages/pass/types/data/items.ts
- packages/pass/types/crypto/pass-types.ts
- packages/pass/types/api/pass.ts

The Proton UI consumes protobuf item content and Proton-specific types such as login, note, creditCard, identity, SSH key, Wi-Fi, and custom items. Vaultwarden sync returns Bitwarden Cipher objects with different fields, IDs, folder semantics, and encryption envelopes.

A mapper is required between Bitwarden cipher DTOs and the Proton UI's item view model. This mapping must preserve item type, fields, URI data, TOTP, custom fields, attachments, favorite/archive/trash state, folder references, and timestamps. Unsupported fields must not be silently discarded.

## Recommended integration architecture

1. Keep upstream Proton UI components, styling, icons, localization, and layout as the presentation layer.
2. Replace the Proton lobby sign-in action with an EagleVault local login view that calls web/src/auth/vaultwarden-password-login.ts.
3. Add a dedicated EagleVault session service for token lifecycle and secure persistence. Do not use Proton fork, cookie-auth, or Proton session-resume flows.
4. Replace the Proton API factory with a Vaultwarden-backed repository for sync, cipher CRUD, folder CRUD, and later attachments.
5. Replace the Proton PassCryptoWorker with Bitwarden SDK crypto operations. Keep the SDK WASM initialization in the application bootstrap, before any crypto call.
6. Add a mapping layer from Bitwarden Cipher DTOs to the minimum Proton UI item model required for the personal vault.
7. Wire repository results into the existing state/store only after the mapping contract is tested. Keep organization shares, invitations, and Proton-only capabilities disabled until they have a Bitwarden-compatible implementation.
8. Remove or replace any remaining Proton-hosted service calls that are not part of the requested presentation layer (for example, Proton account/fork flows and Proton API image/telemetry calls).

## Acceptance gates

- The local login view must never call Proton account endpoints.
- The pinned Bitwarden SDK WASM must be initialized exactly once before the first crypto operation.
- Login must use the server's KDF settings and send only the derived authentication hash to the identity endpoint.
- Access and refresh tokens must be stored using an explicitly reviewed secure-storage design; do not put them in localStorage.
- Sync must decrypt with Bitwarden SDK crypto and map to UI view models without losing supported fields.
- Create, update, delete, folder changes, logout, refresh, and app restart must be tested against a disposable Vaultwarden instance.
- Existing Proton session, crypto, and API paths must not run in parallel with EagleVault paths.

## Current status

The transport, pre-login, identity, and Bitwarden crypto layers have 20 passing synthetic contract tests. The isolated EagleVault branch is now wired into App.tsx; it deliberately does not mount LobbyContent, PrivateApp, the Proton Redux store, or the Proton Pass crypto worker. The upstream Proton UI source is modified only at the application bootstrap boundary. Do not use the current UI integration as a real password vault until all acceptance gates pass.

## EagleVault Web login integration (current milestone)

The imported Proton Web application now has an explicit isolated mode:

- Open the built Web app with the query parameter `?eaglevault=1`.
- In this mode, App.tsx selects `applications/pass/src/app/EagleVault/EagleVaultApp.tsx` inside the Proton app shell, while the standard Proton account/store subtree is not mounted.
- The standard Proton Pass AuthService/AuthStore/Redux StoreProvider tree, PassExtensionLink, ConnectivityProvider, and Proton SSO/session-resume path are skipped; the Proton AuthStore is not created, and the Proton Redux store and web sagas do not start.
- Proton Pass crypto worker exposure, API exposure, connectivity initialization, Sentry initialization, domain-image API requests, and Proton telemetry/B2B callbacks are skipped or no-op in this mode. The outer Proton app shell and PassCore provider remain mounted; EagleVault's login panel owns its own theme styling.
- The login form initializes the official Bitwarden SDK WASM, performs pre-login/KDF derivation and the password token grant, then calls Vaultwarden `/api/sync` and `/api/folders`.
- Identity requests identify as Bitwarden Web (`client_id=web`) and use device type 14 (UnknownBrowser); the device identifier is a random UUID stored in localStorage. It is not a credential.
- Access and refresh tokens are not persisted. The access token remains in component memory only for the current page lifetime.

The login panel is currently a dedicated EagleVault component styled to fit the Proton app shell; it does not yet reuse Proton's exact form components or private-vault item UI. This is an authentication-and-sync connectivity milestone, not a finished vault. It intentionally displays encrypted item and folder counts only. It does not yet decrypt the account's protected user key, decrypt ciphers, refresh tokens, persist a session, or map items into Proton's private-vault UI. Do not enter production credentials until those stages and a disposable-server end-to-end test have passed.

Verification on EC2AMAZ-RM1TCO7: `corepack pnpm --config.verify-deps-before-run=false --filter proton-pass check:types` passed, and `corepack pnpm --config.verify-deps-before-run=false --filter proton-pass build:web` completed successfully. The build emitted two warnings; the generated bundle contains the EagleVault login component and the stable device-id key. Dependency bootstrap required a filtered install with the public npm registry for `@protontech` packages because the clone's private GitLab package registry was unreachable from this environment. No live Vaultwarden login was attempted.
