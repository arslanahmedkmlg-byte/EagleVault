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
