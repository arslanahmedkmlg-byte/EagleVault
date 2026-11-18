# Android integration

The Android upstream checkout uses Kotlin/Gradle, Hilt and Proton Core networking. The initial EagleVault transport contract is defined in shared/contracts/bitwarden-api.ts and the Web transport is in web/src/api/vaultwarden-client.ts.

Android work must implement the same contract without introducing a second cipher format:
1. Add isolated EagleVault API, crypto, data and session modules using the existing Gradle conventions.
2. Use the audited Android networking stack only after verifying its base URL and auth interceptors can be configured independently of Proton services.
3. Map Vaultwarden DTOs to the shared domain concepts in shared/contracts/vault.ts.
4. Keep token and key handling in dedicated session/crypto boundaries.
5. Add mock HTTP tests and cross-platform crypto fixtures before connecting Compose UI, Autofill or biometrics.

No Proton Android source has been copied into this repository yet. The audited source locations and baseline commits are in docs/PHASE-1-IMPLEMENTATION.md and docs/UPSTREAM-REVISIONS.md.
