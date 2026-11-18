# Android client

The full Proton Pass Android source snapshot is in `upstream/`. EagleVault's isolated Android adapter module is `upstream/pass/eaglevault/api`.

## Current adapter

- Retrofit endpoints for Vaultwarden sync, cipher CRUD and folder CRUD.
- Caller-supplied bearer authorization; no Proton authentication or API host is reused.
- Opaque encrypted JSON request bodies; Bitwarden cipher decryption is deliberately outside the transport layer.
- HTTPS required, except loopback HTTP for local development.
- Redirects disabled to prevent authorization forwarding to another origin.
- URL credentials, query strings and fragments rejected.

## Remaining Android work

- Integrate the official Bitwarden Kotlin UniFFI SDK for KDF, key hierarchy and cipher crypto. Do not substitute Proton crypto.
- Implement Bitwarden identity pre-login/password grant and refresh-token lifecycle.
- Add encrypted session persistence, biometric lock/unlock and logout cleanup.
- Map decrypted personal cipher types into the retained Proton Pass presentation models.
- Wire sync and CRUD into the Android UI.
- Verify Android and Web against the shared synthetic vectors, then run end-to-end tests against a disposable Vaultwarden server.

## Build status

The development device currently has no Java/JDK or Rust toolchain, so Gradle compilation and native SDK integration cannot be verified there. No production Vaultwarden credentials have been used. Login and vault writes remain gated until crypto and lifecycle tests pass.
