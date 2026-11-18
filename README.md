# EagleVault

A Proton Pass-derived password manager for **Android and Web**, targeting a self-hosted Vaultwarden-compatible backend.

EagleVault is developed in **one public repository**. Android, Web, backend compatibility, shared contracts, documentation and tests live together.

## Repository layout
- android/ — Android client integration.
- web/ — Web client integration.
- backend/ — backend compatibility and deployment work.
- shared/ — domain, API and crypto-boundary contracts.
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
The root LICENSE is AGPL-3.0 for the combined project. Original upstream copyright notices and license terms remain applicable to upstream-derived code. See LICENSES/README.md. No Bitwarden commercial-module code may be copied into EagleVault.

## Status
The repository currently contains initial architecture, source audit, contracts and licensing manifest. It does not yet contain the Proton applications or a working Vaultwarden adapter. See docs/IMPLEMENTATION-STATUS.md.
