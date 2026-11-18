# Implementation status

Last updated: 2026-11-19

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

## Not yet implemented
- No Bitwarden cryptographic implementation has been integrated.
- No login/token flow, API transport, sync repository or UI adapter is production-ready.
- No Android Vaultwarden adapter is wired into the imported Android app.
- The Web transport is a standalone adapter and is not yet wired into Proton's API factory, auth store, crypto worker or sync engine.
- No cross-platform crypto or live Vaultwarden integration tests have passed.

## Next work
1. Pin exact upstream commits in docs/UPSTREAM-REVISIONS.md.
2. Review dependency licenses and build prerequisites.
3. Build an executable TypeScript API contract test harness.
4. Implement Web transport and auth only after identity route behavior is verified.
5. Implement Android equivalents against the same contracts.
6. Add crypto only after official golden vectors are available.
7. Bring in Proton UI source selectively with original attribution and build dependencies.

## Web transport milestone
- Added a small authenticated Vaultwarden REST client for sync, cipher CRUD and folder CRUD.
- Server URL is configurable and HTTPS is enforced except localhost development.
- Redirects are rejected and browser credentials are not implicitly included.
- Added Node built-in tests for URL validation, bearer headers, sync URL, cipher POST, typed errors and encoded delete IDs.
- Test command: node --experimental-strip-types --test tests/contracts/vaultwarden-client.test.mjs
- Result at this milestone: 5 passed, 0 failed.
- This is a transport layer only. Token acquisition/refresh, crypto, DTO mapping, UI wiring and Android implementation remain outstanding.

## Build environment findings
- Node.js v24.22.3 is available on EC2AMAZ-RM1TCO7.
- The Web transport's five Node built-in tests pass using Node's TypeScript strip mode.
- Java/JDK is not installed on the device, so Android Gradle builds cannot currently run there.
- The Web workspace declares pnpm 12.18.0; dependency installation and full application build have not yet been attempted.

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
- Important correction to milestone tracking: the Web client currently has cipher/folder transport only. Password-login and refresh-token methods are not yet present in the committed source. The Android API module currently exposes identity token form submission but does not implement KDF or token lifecycle.

## Web pre-login discovery milestone
- Added `web/src/api/vaultwarden-prelogin.ts` for Vaultwarden's unauthenticated `POST /api/accounts/prelogin` route.
- Normalizes email to lowercase/trimmed form and uses it as the legacy KDF salt.
- Parses both PBKDF2-SHA256 and Argon2id KDF configurations.
- Enforces Bitwarden-compatible pre-login parameter bounds and rejects unknown KDF types.
- Added four contract tests; all nine current Web contract tests pass.
- This discovers parameters only. It does not derive keys, authenticate, unlock a vault, or permit writes.

## Bitwarden SDK crypto milestone
- Pinned the official `@bitwarden/sdk-internal` npm package at `0.2.0-main.1244` (source revision `8da8618f9cbefbfdd26c0a300b0743081afa232f`, GPL-3.0).
- Added a Web WASM initialization loader and a thin crypto provider that delegates KDF, user-key wrapping/unwrapping, and AES-256-CBC-HMAC field crypto to Bitwarden's SDK.
- Added an identity client for password and refresh grants and a password-login orchestrator that runs pre-login first and never submits the plaintext master password.
- The orchestrator zeroes its temporary master-key byte array after authentication.
- All 19 Web contract tests pass using synthetic fixtures.
- Android audit found Bitwarden's official Kotlin UniFFI SDK. Native integration is not yet built: this device has no JDK, Rust toolchain, or Android NDK. Do not substitute Proton's crypto for Bitwarden's format.
- Credential storage and full vault unlock remain disabled until Android and browser WASM initialization are integrated into the actual Proton app startup and cross-client vectors pass.
