# Implementation status

Last updated: 2026-11-19

## Completed
- Single public GitHub repository initialized with AGPL-3.0 root license.
- Android, Web, backend, shared, docs and tests areas created.
- Proton Pass Web, Android and common GPL-3.0 license texts preserved.
- Vaultwarden AGPL-3.0 license text preserved.
- Bitwarden client GPL-3.0 and commercial-module restriction texts preserved.
- Initial domain, API transport and crypto-boundary TypeScript contracts added.
- Vaultwarden cipher/folder route surface documented from local source.

## Not yet implemented
- No Proton application source has been copied into this repository.
- No Bitwarden cryptographic implementation has been integrated.
- No login/token flow, API transport, sync repository or UI adapter is production-ready.
- No Android adapter modules or Web runtime application are wired up.
- No cross-platform crypto or server integration tests have passed.

## Next work
1. Pin exact upstream commits in docs/UPSTREAM-REVISIONS.md.
2. Review dependency licenses and build prerequisites.
3. Build an executable TypeScript API contract test harness.
4. Implement Web transport and auth only after identity route behavior is verified.
5. Implement Android equivalents against the same contracts.
6. Add crypto only after official golden vectors are available.
7. Bring in Proton UI source selectively with original attribution and build dependencies.
