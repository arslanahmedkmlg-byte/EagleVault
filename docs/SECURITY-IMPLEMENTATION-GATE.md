
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
