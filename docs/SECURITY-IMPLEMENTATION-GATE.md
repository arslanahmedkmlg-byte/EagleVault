
# Security implementation gate

See [implementation status](IMPLEMENTATION-STATUS.md) for current delivery and test results. Core/Web authentication and encrypted vault operations are implemented for local synthetic testing; they are **not approved for public production use**.

Before deploying or permitting real user data, complete and review:

1. Independently review the Bitwarden-compatible KDF, authentication hash, key wrapping, ciphertext envelope, and SDK version. Confirm no master password or decrypted vault contents reach Core.
2. Test wrong passwords, malformed/corrupt ciphertext, token expiry, refresh replay/revocation, account isolation, and concurrent sync conflicts against the actual Worker runtime.
3. Review rate limits and abuse controls, registration privacy, email verification/recovery policy, error responses, logs, and secret handling.
4. Verify backup/restore and schema migration/rollback. Current snapshot portability covers encrypted vault records only; it does not back up accounts or sessions.
5. Complete a security and dependency/license review, document unsupported features, and approve a restricted staging deployment before any production exposure.
6. For cross-platform release, implement Android crypto and secure storage against the same protocol and vectors, then pass the Web↔Android acceptance test.
7. For Linux portability claims, implement and test a Linux SQLite adapter and export/import migration; the portable domain boundary alone is not sufficient.

Synthetic local workerd and Web contract tests are useful evidence but do not constitute production security approval. No production deployment or DNS changes are authorized by this document.

## Staging deployment status

Isolated staging passed a synthetic deployed lifecycle on 2026-11-19:
- Core: `https://eaglevault-core-staging.arslanahmed-kmlg.workers.dev`
- Web: `https://eaglevault-web-staging.arslanahmed-kmlg.workers.dev`
- Static assets require an HTTP Basic staging secret.
- Core API requests require the matching staging-key header.
- Registration remains disabled in the production source configuration and staging registration is enabled only behind the staging gate.
- The suite verified encrypted create/read/edit/delete, persistence/relogin, synchronization, refresh replay rejection, logout revocation, account isolation, CORS, HTTPS, security headers, and absence of plaintext vault content in request bodies and export snapshots.

This staging acceptance does not replace an independent cryptographic security review, account backup/recovery policy, Linux migration test, Android interoperability test, or production approval.

## Production deployment status

The production Web and Core custom domains were deployed on 2026-11-20 at commit `ca7dc61f18dff688fc861122bed28085b285164c`.

Production registration is currently disabled (`REGISTRATION_ENABLED=false`). Vault APIs still require bearer authentication. CORS allows only `https://eaglevault.eaglenet.asia`, and the staging key header is rejected as a production CORS header. Staging is deployed under separate Worker names and workers.dev URLs with no production data binding.

## Browser startup review

Mobile Chromium testing on 2026-11-20 identified and fixed a Proton-provider boot dependency that prevented EagleVault mode from rendering. EagleVault now renders before Proton app modules load, and the live Web app showed no page exceptions, console errors, failed assets, HTTP error responses, or Proton account/API requests.

## Optional Web device screen-lock unlock (WebAuthn PRF)
- The Web UI can opt in after a successful master-password login. WebAuthn `userVerification: required` invokes the device's passkey/biometric/PIN screen-lock verification.
- A 32-byte credential PRF output is imported as a non-extractable AES-GCM key to encrypt the 64-byte vault user key and a rotating refresh token before they are saved in the browser's local storage. The encryption uses a fresh 96-bit nonce and account/origin-bound associated data; plaintext keys and tokens are not stored in local storage.
- This is **local passkey-protected unlock, not server-verified WebAuthn authentication**. A valid encrypted refresh token is still required for Core reauthentication. Core sessions are refreshed and the protected token is re-encrypted after rotation.
- Master-password login remains available, including when the browser lacks the PRF extension or device verification fails. The passkey and encrypted local state are browser-profile-specific and not an account recovery method.
- Lock clears in-memory vault material while retaining an encrypted refresh token to allow another local passkey unlock. Explicit logout revokes the current session and deletes that browser's stored unlock record. Clearing browser storage also removes the local unlock.
- Browser/device PRF support and all account recovery paths remain subject to actual-device verification and independent security review. Same-origin XSS or malicious browser extensions remain material threats. Never claim biometric-only server authentication.
