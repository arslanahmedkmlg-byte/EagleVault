# Implementation status

Last updated: 2026-11-20

## Current milestone: production Web/Core deployment

**Production (authorized initial testing deployment):**
- Web: `https://eaglevault.eaglenet.asia` — HTTP 200
- Core: `https://api.eaglevault.eaglenet.asia` — HTTP 200 health
- Core Worker version: `dc237cf2-30bb-4ecc-92bd-966abb69a8c6`
- Web Worker version: `7a4bd00d-f38a-4846-baa1-e35219dd1d9e`
- Git commit: `ca7dc61f18dff688fc861122bed28085b285164c`
- Registration: disabled
- DNS: Cloudflare-proxied Workers Custom Domains; no IP records for these hostnames
- TLS: valid Cloudflare certificates observed for both hostnames
- Deep links `/app/`, `/settings/`, and `/vault/item/test`: HTTP 200

**Production-domain checks passed:** Core health, Web root/deep routes, HSTS/CSP/referrer/framing/content-type headers, exact production CORS origin, rejection of attacker origins and the staging-only header, disabled registration, KDF discovery, unauthenticated vault rejection, and absence of staging URLs in the production JavaScript entry.

**Browser boot fix deployed 2026-11-20:** Commit `053ea592`. Mobile Chromium verification passed for `/`, `/settings/`, and the EagleVault unlock screen. No page exceptions, console errors, failed assets, HTTP error responses, or Proton account/API requests were observed. The Web-only Worker version is `9f7de03a-7aed-40ad-8ea0-3559e4ee329d`.

**Live staging (isolated; no production DNS or production Workers changed):**
- Web: `https://eaglevault-web-staging.arslanahmed-kmlg.workers.dev`
- Core: `https://eaglevault-core-staging.arslanahmed-kmlg.workers.dev`
- Both Workers use workers.dev URLs only. The Web Static Assets deployment is protected by HTTP Basic staging authentication. The Core API is protected by a staging-key header and exact-origin CORS. Registration is enabled only under those staging gates.
- Core deployment version: `b4d34a36-73bc-4488-ac54-89546e82ab52`
- Web deployment version: `02ed46b4-5f73-4277-8418-34e079dc09e9`

**Deployed staging acceptance passed:** HTTPS, Basic-auth static assets, Core staging access key, exact CORS origin, HSTS/CSP/security headers, synthetic registration, login/unlock, encrypted create/read/edit/delete, persistence/relogin, synchronization, refresh rotation, replay rejection, logout revocation, account isolation, and plaintext request-body/export checks.

The active branch is `codex/web-first`, based on the reviewed `handoff/server-core-2026-11-20` commit `4de39d80`. The local `main` branch is unchanged. Production deployment is live at the EagleVault custom domains for restricted initial testing; Android feature work has not started.

The EagleVault Core now has account registration, fixed PBKDF2 KDF discovery, derived-password authentication, access/refresh token rotation and revocation, per-account and per-IP rate limits, encrypted-record CRUD, versioned sync/conflict handling, and encrypted-record snapshot export/import. Account and vault persistence use the portable SQLite interface; Cloudflare SQLite-backed Durable Objects are the initial adapter. Snapshot export/import does not include accounts or sessions, and a working Linux storage adapter is still missing.

The EagleVault Web mode now uses the Core API and Bitwarden SDK for KDF/authentication, wrapped-key unlock, encrypted login-item/folder operations, search, password generation/reveal/copy, refresh, lock, and logout. The app mode is selected automatically on `eaglevault.eaglenet.asia` and by `?eaglevault=1` for local preview. The production build is branded EagleVault and the Static Assets Worker adds a restrictive CSP and security headers.

**Verification completed locally:**
- Core unit tests: 12 passed.
- Synthetic Web-to-Core workerd lifecycle: passed registration, KDF discovery/unlock, encrypted CRUD, conflicts, sync, account isolation, refresh rotation, logout/replay rejection, and plaintext-request-body checks.
- Web/client/crypto/route contract tests: 28 passed.
- Web TypeScript check, changed-source lint, and production build: passed.
- Wrangler 4.165.0 dry-run: read 414 assets and bundled the Static Assets Worker successfully.
- Local `wrangler dev --local`: `/` and a deep SPA route both returned HTTP 200 with CSP, HSTS, referrer, framing, and content-type security headers.

**Not a production acceptance:** No browser-based account lifecycle has been run against the deployed Cloudflare Worker. Cloudflare still has not received the new Worker code; the API deployment and Web hostname DNS/custom-domain setup remain pending approval. Do not expose registration publicly until the production security gate below is complete. Account email verification/recovery, broader crypto/security review, persistent account backup, Linux adapter/migration tests, and review of rate-limit and abuse controls remain open. No Android↔Web interoperability has been tested.

**Next:** complete local UI/runtime checks and security review, then request explicit approval for a staging deployment. Production deployment/DNS changes require separate explicit approval. Only after the deployed Web acceptance test passes should Android integration begin.

## Historical implementation notes

The rest of this document records earlier adapter and prototype milestones. Those notes are retained for audit history and are not the current implementation status.

## Completed
- Imported Proton Pass Android source snapshot into android/upstream.
- Imported Proton Pass Web application plus shared workspace packages/configuration into web/upstream; unrelated Proton web apps and browser extension/desktop clients were excluded.
- Imported Vaultwarden source into backend/vaultwarden.
- Imported Proton Pass common Rust source into shared/proton-pass-common.
- Recorded exact upstream commits in docs/UPSTREAM-IMPORTS.md.
- Single public GitHub repository initialized with AGPL-3.0 root license.
- Android, Web, backend, shared, docs and tests areas created.
- Proton Pass Web, Android and common GPL-3.0 license texts preserved.
- Vaultwarden AGPL-3.0 license text preserved.
- Bitwarden client GPL-3.0 and commercial-module restriction texts preserved.
- Initial domain, API transport and crypto-boundary TypeScript contracts added.
- Vaultwarden cipher/folder route surface documented from local source.

## Remaining work
- Expand cipher decryption to all supported Bitwarden subtypes and add robust handling for malformed/unsupported items.
- Map Bitwarden Cipher and Folder DTOs into the Proton Pass private-vault view model without losing supported fields.
- Implement a reviewed secure browser session store and access-token refresh/lock lifecycle.
- Wire create/update/delete and folder operations into the UI.
- Build and integrate the official Android UniFFI SDK; the Android API adapter remains transport-only.
- Run cross-platform vectors and end-to-end tests against a disposable Vaultwarden server.
- No live Vaultwarden account has been used; production credential storage remains disabled.

## Next work
1. Expand the Bitwarden-to-EagleVault decrypted item model to cover every personal-vault cipher subtype.
2. Implement the Bitwarden-to-Proton private-vault DTO mapper and preservation tests.
3. Add secure session persistence, refresh, lock/unlock, and logout.
4. Wire cipher and folder CRUD into the Web view.
5. Integrate the official Kotlin UniFFI SDK in Android and consume the same shared vectors.
6. Validate the complete Web/Android lifecycle against a disposable Vaultwarden instance.

## Web transport milestone
- Added a small authenticated Vaultwarden REST client for sync, cipher CRUD and folder CRUD.
- Server URL is configurable and HTTPS is enforced except localhost development.
- Redirects are rejected and browser credentials are not implicitly included.
- Added Node built-in tests for URL validation, bearer headers, sync URL, cipher POST, typed errors and encoded delete IDs.
- Test command: node --experimental-strip-types --test tests/contracts/vaultwarden-client.test.mjs
- Result at this milestone: 5 passed, 0 failed.
- This REST transport remains a separate layer. Identity and Bitwarden crypto were added later; secure token lifecycle, cipher DTO mapping, full UI CRUD and Android crypto integration remain outstanding.

## Build environment findings
- Node.js v24.22.3 is available on EC2AMAZ-RM1TCO7.
- The Web transport's five Node built-in tests pass using Node's TypeScript strip mode.
- Java/JDK is not installed on the device, so Android Gradle builds cannot currently run there.
- The Web workspace declares pnpm 12.18.0. A filtered dependency install and full Proton Pass Web production build were subsequently completed; see the 2026-11-19 Web build milestone below.

## Android API adapter milestone
- Added the isolated Gradle module pass:eaglevault:api under android/upstream.
- Added Retrofit endpoints for sync, cipher CRUD and folder CRUD.
- Added a factory that requires HTTPS except localhost and disables HTTP/HTTPS redirects.
- Authorization is passed explicitly per request; the module does not reuse Proton authentication interceptors.
- Android module compilation remains unverified because the device has no JDK.

## Source audit conclusion
The imported Proton Web API factory calls Proton shared API configuration and protonFetch; the Proton crypto manager is hydrated with Proton user/address keys and share managers; Proton sync dispatches through Proton legacy or user-event sync strategies. These are architectural dependencies, not just branding or endpoint URLs. The Vaultwarden adapter must replace the API/auth/data/crypto/sync boundaries, while retaining UI only where its domain model can be safely mapped.

- 2026-11-19 crypto/auth audit: documented Bitwarden KDF and legacy authentication-hash requirements in docs/CRYPTO-AUTH-AUDIT.md.
- Added a mandatory security implementation gate in docs/SECURITY-IMPLEMENTATION-GATE.md. Login and vault writes must remain disabled until key derivation, encryption, secure storage, and cross-platform vectors are complete.
- Historical correction from the initial transport milestone: Web password login and refresh-grant request serialization have since been added. Refresh-token lifecycle/persistence is still not implemented. The Android API module remains transport-only and does not implement KDF or token lifecycle.

## Web pre-login discovery milestone
- Added `web/src/api/vaultwarden-prelogin.ts` for Vaultwarden's unauthenticated `POST /api/accounts/prelogin` route.
- Normalizes email to lowercase/trimmed form and uses it as the legacy KDF salt.
- Parses both PBKDF2-SHA256 and Argon2id KDF configurations.
- Enforces Bitwarden-compatible pre-login parameter bounds and rejects unknown KDF types.
- Added four pre-login contract tests at that milestone; the current complete Web contract suite has 20 passing tests.
- This discovers parameters only. It does not derive keys, authenticate, unlock a vault, or permit writes.

## Bitwarden SDK crypto milestone
- Pinned the official `@bitwarden/sdk-internal` npm package at `0.2.0-main.1241` (source revision `6238472451e4fa7b5c592b4b24a84e950a258957`, GPL-3.0).
- Added a Web WASM initialization loader and a thin crypto provider that delegates KDF, user-key wrapping/unwrapping, and AES-256-CBC-HMAC field crypto to Bitwarden's SDK.
- Added an identity client for password and refresh grants and a password-login orchestrator that runs pre-login first and never submits the plaintext master password.
- The orchestrator zeroes its temporary master-key byte array after authentication.
- All 20 Web contract tests pass using synthetic fixtures.
- Android audit found Bitwarden's official Kotlin UniFFI SDK. Native integration is not yet built: this device has no JDK, Rust toolchain, or Android NDK. Do not substitute Proton's crypto for Bitwarden's format.
- Secure session persistence and full production unlock remain disabled until secure token lifecycle, broader cipher coverage, Android parity, and end-to-end tests pass.

- Added shared synthetic crypto vectors in shared/test-vectors/bitwarden-crypto-v1.json; Web verifies fixed KDF/authentication outputs, user-key unwrap, per-cipher-key unwrap, and encrypted login/custom-field decryption.
- Aligned the Web SDK package to 0.2.0-main.1241, whose embedded source revision is 6238472451e4fa7b5c592b4b24a84e950a258957. This matches the successful Bitwarden Android SDK build workflow run 43405701364 source revision.
- Full Web contract suite now passes 20/20.

## Proton Web integration audit
- Audited App.tsx, AuthServiceProvider, Lobby, LobbyContent, AuthStore, PassCryptoWorker, and Proton item view models.
- Confirmed the Proton login is based on Proton account/fork/session flows; the current Lobby does not expose a local email/master-password form.
- Confirmed the Proton crypto worker requires Proton user/address/group/share keys and cannot decrypt Bitwarden ciphers.
- Documented the replacement boundaries and acceptance gates in docs/WEB-INTEGRATION-AUDIT.md.
- No upstream Proton UI source files were changed during the initial audit; the later Web milestone adds only an isolated App.tsx bootstrap branch and a separate EagleVault login component.

- Added an isolated Proton Web app mode at `?eaglevault=1`. It bypasses Proton AuthService startup, Proton crypto worker/API exposure, connectivity initialization and Sentry setup, then renders a dedicated EagleVault login page.
- The login page initializes Bitwarden WASM, authenticates against the user-entered Vaultwarden URL, unwraps the protected user key, fetches sync/folders, and decrypts supported personal ciphers. Password values are masked until selected.
- Browser tokens remain memory-only and are discarded on reload/sign-out. No real credentials have been used.
- Proton Pass Web TypeScript check and production build now pass. The isolated EagleVault branch is bundled; no live Vaultwarden credentials have been tested. The full lint command could not be verified because oxlint panicked in this environment.

- 2026-11-19 Web build milestone: `?eaglevault=1` selects the EagleVault login view within the Proton app shell while bypassing Proton account/session, Redux store/sagas, PassCrypto exposure, Proton API exposure, telemetry bootstrap and connectivity startup.
- Added `@bitwarden/sdk-internal@0.2.0-main.1241` to the Proton Pass workspace and pnpm lockfile. This version meets the repository's minimum-release-age rule and matches successful Android SDK workflow run 43405701364.
- Proton Pass Web `check:types` passed; `build:web` passed and emitted the login bundle. The built bundle was checked for the EagleVault login copy and device identifier key.
- Login is a dedicated EagleVault panel inside the Proton shell (exact Proton form-component reskin remains future work). It performs KDF prelogin, identity password grant, unwraps the master-password-protected user key, fetches sync/folders, and decrypts supported personal-vault fields. Passwords remain hidden until an item is selected. The access token and user key remain in component memory; refresh-token persistence and full CRUD are not implemented.
- Corrected identity endpoint to `/identity/connect/token` (not `/api/identity/connect/token`).

- Personal-vault unlock milestone: identity response Key is now unwrapped with Bitwarden SDK using the server-provided KDF. The resulting 64-byte user key is held in a component ref and zeroed on sign-out/failure. The temporary master key and per-cipher item keys are zeroed immediately after use, with explicit contract tests.
- Added a personal-vault cipher decryptor for per-cipher keys, names, notes, login credentials/TOTP/URIs, custom fields, card, identity, SSH key, bank account, driver license, passport, and password history. Organization ciphers are explicitly skipped because organization-key support is not implemented.
- EagleVault Web now lists decrypted personal items, shows usernames/URIs, and keeps passwords masked until an item is selected and the user presses Reveal. Decrypted objects and user key are cleared on sign-out.
- Added fixed shared encrypted user-key and item-key/cipher vectors. All 20 Web contract tests pass, including user-key unlock and nested cipher-field decryption.

## Android transport implementation milestone — 2026-11-19
- Added concrete Retrofit service methods for Vaultwarden sync, cipher create/update/delete, and folder list/create/update/delete.
- Added an isolated API factory with HTTPS enforcement except loopback development, URL credential/query/fragment rejection, explicit timeouts, and redirect refusal.
- Authorization remains a caller-supplied header; the transport does not reuse Proton account or API infrastructure.
- Added unit tests for URL policy and loopback development acceptance.
- Web contract suite remains green: 20/20 tests.
- Android compilation is still unverified: the connected build device has no Java/JDK or Android SDK toolchain available. The official Bitwarden Kotlin UniFFI crypto SDK, login, encrypted session lifecycle, and UI integration remain the next Android milestones. Do not use real vault credentials until these gates are complete.
