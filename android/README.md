# Android client

The full Proton Pass Android source snapshot is in upstream/. EagleVault-specific integration must preserve upstream GPL-3.0 notices and should be introduced behind isolated API, crypto, data and session interfaces.

Current state:
- Upstream Android source imported; no source changes made to it yet.
- Java/JDK is not installed on the development device, so Gradle builds have not been run.
- Vaultwarden transport/API contract exists in shared/contracts/bitwarden-api.ts.
- Android must implement the same Bitwarden-compatible KDF, key hierarchy and cipher format as Web, verified with shared golden vectors.

Do not wire Proton Core authentication or the Proton API host into the Vaultwarden adapter. Review and replace those boundaries deliberately. Source commit: docs/UPSTREAM-IMPORTS.md.
