# Android client

The full Proton Pass Android source snapshot is in upstream/. EagleVault's first Android adapter module is upstream/pass/eaglevault/api.

Current state:
- Upstream Android source imported; original files remain unmodified except the new module include in settings.gradle.kts.
- Added an isolated Retrofit/OkHttp API interface for Vaultwarden sync, cipher CRUD and folder CRUD.
- Bearer token is supplied explicitly by the caller; no Proton auth or API host is reused.
- Request bodies are raw encrypted JSON. Login, token refresh, serialization, crypto, persistence and UI wiring remain future work.
- Java/JDK is not installed on the development device, so Gradle compilation has not been run.
- Android must implement the same Bitwarden-compatible KDF, key hierarchy and cipher format as Web, verified with shared golden vectors.

See docs/UPSTREAM-IMPORTS.md for source commit attribution.
