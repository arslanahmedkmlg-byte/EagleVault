# EagleVault

A Proton Pass-derived password manager for **Android and Web**, targeting a self-hosted Vaultwarden-compatible backend.

EagleVault is developed in **one public repository**. Android, Web, backend compatibility, shared contracts, documentation and tests live together.

## Repository layout
- android/upstream/ — imported Proton Pass Android source snapshot.
- web/upstream/ — imported Proton Pass Web application and shared workspace packages.
- backend/vaultwarden/ — imported Vaultwarden source snapshot.
- shared/proton-pass-common/ — imported Proton Pass shared Rust source.
- shared/contracts/ — EagleVault domain, API and crypto-boundary contracts.
- web/src/ — EagleVault Web adapter work.
- docs/ — architecture, source audit, implementation status and upstream revisions.
- tests/ — contract and cross-platform tests.
- LICENSES/ — preserved upstream license texts and provenance notes.

## Security principles
- Encryption and decryption happen on clients; the server receives compatible ciphertext.
- Do not invent a new vault cryptographic format.
- No real credentials or production vault exports in fixtures, commits or logs.
- Keep master keys and decrypted user keys out of logs and crash reports.
- Validate crypto against cross-platform golden vectors before enabling writes.

## Licensing
The root LICENSE is AGPL-3.0 for the combined project. Original upstream copyright notices and license terms remain applicable to upstream-derived code. See LICENSES/README.md and docs/UPSTREAM-IMPORTS.md. No Bitwarden commercial-module code may be copied into EagleVault.

## Status
The upstream source snapshots, initial contracts and standalone Web transport are present. The Web transport is not yet connected to Proton's auth, crypto or sync systems, and Android integration is not yet implemented. See docs/IMPLEMENTATION-STATUS.md.
