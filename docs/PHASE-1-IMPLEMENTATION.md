# EagleVault Phase 1 — Source Audit and Implementation Plan

Audit date: 2026-11-19. Scope: Android + Web. UI foundation: Proton Pass. Backend: self-hosted Vaultwarden via its Bitwarden-compatible API.

## Decisions
1. Retain Proton UI/workflows where practical; replace Proton-specific authentication, API, remote data, sync and cryptography assumptions.
2. Both clients must use the same Bitwarden-compatible KDF, key hierarchy, authenticated encryption and cipher serialization. Do not invent crypto or upload plaintext.
3. Backend URL is configurable, never hard-coded.
4. New adapter work stays in this integration workspace until tested; keep upstream checkouts clean.
5. Do not copy from clients/bitwarden_license. The Bitwarden clients repository states default code is GPL-3.0 except that directory, which has a separate commercial license. Check file headers/package licenses before reuse.
6. Preserve GPL-3.0 / AGPL-3.0 notices and comply with distribution/network-use obligations.

## Confirmed source boundaries
Web:
- UI: WebClients/applications/pass
- Shared logic: WebClients/packages/pass
- Proton API lifecycle: packages/pass/lib/api
- Auth/session: packages/pass/lib/auth
- Crypto/key hierarchy: packages/pass/lib/crypto/pass-crypto.ts and cache/crypto modules
- Sync engine: packages/pass/lib/sync
- Domain requests: items, folders, shares, vaults, attachments and sync
Important: shared implementation is in packages/pass, not only applications/pass/src.

Android:
- UI/features: android-pass/pass/features/*
- Contracts/repositories: pass/data/api
- Proton API: pass/data/impl/.../api/PasswordManagerApi.kt
- Remote data sources: pass/data/impl/.../remote
- Gateways: pass/data/impl/.../network/RemoteApiGateway.kt and CoreRemoteApiGateway.kt
- HTTP setup: pass/network/impl/PassApiClient.kt and NetworkModule.kt
- Proton crypto: pass/crypto/api and pass/crypto/impl
- Local persistence: pass/data/impl/.../db and local data sources
- Sync presentation: pass/features/sync; sync behavior also exists in data/use-case modules.

Backend/reference:
- Vaultwarden ciphers.rs implements GET /sync returning profile, folders, collections, policies, domains, sends, ciphers and user-decryption metadata.
- Vaultwarden folders.rs and ciphers.rs define folder/cipher routes.
- Bitwarden clients repository says default code is GPL-3.0 except /bitwarden_license.

## Retain initially (subject to tests)
- Web visual components, navigation, forms, lists/details, password generator, import/export UI, localization and generic UI state.
- Android Compose UI, navigation, Autofill UX, biometrics UX, password generator and clipboard UX.
- Local encrypted DB/offline cache concepts after reviewing schema and key handling.
- Generic accessibility and design-system components without Proton service dependencies.

## Replace/adapt
- Proton login/session providers; Proton Core API clients; Proton share/vault/item key hierarchy; CryptoProxy; Proton event sync and processors.
- Proton-only aliases, SimpleLogin, organizations, breach monitoring, secure links and subscription services are not part of the first compatible slice.

## Phase 1 vertical slice
One synthetic Login item must travel Android -> Vaultwarden -> Web and Web -> Vaultwarden -> Android.
1. Use a disposable Vaultwarden test instance and synthetic account.
2. Implement compatible identity/token flow and local KDF/key derivation.
3. Verify key derivation and encryption against compatible test vectors.
4. Encrypt all sensitive fields locally; create a Login cipher.
5. POST cipher; GET /api/sync; map encrypted cipher into shared EagleVault domain model.
6. Decrypt on the other client and compare name, username, password, URI, notes and folder.
7. Repeat in reverse direction.
8. Verify server-side records contain ciphertext, not fixture plaintext.
Never use real credentials or production vault data in Phase 1.

## Shared contract to define
- VaultItem: UUID, type, name, notes, favorite, folder, timestamps, custom fields and type-specific data.
- LoginData: username, password, URIs and encrypted TOTP secret. Passkeys require a separate audit.
- Folder: UUID and encrypted name.
- Session: tokens, expiry, KDF config and local key state; never log master/decrypted keys.
- VaultRepository: login, refresh, lock, unlock, sync, create/update/delete item, create/update folder and move item.
- CryptoProvider: KDF/key derivation, authenticated encrypt/decrypt, cipher serialization and zeroization.
- SyncResult: profile, encrypted ciphers, folders, collections and sync metadata.
Keep API DTOs separate from UI/domain models.

## Web adapter targets (create independently first)
- web/src/config/BackendConfig.ts
- web/src/api/BitwardenTransport.ts, IdentityApi.ts, SyncApi.ts, CipherApi.ts, FolderApi.ts
- web/src/crypto/BitwardenCryptoProvider.ts
- web/src/mappers/CipherMapper.ts
- web/src/repositories/VaultRepository.ts
- web/test/fixtures/
After tests pass, integrate behind interfaces in WebClients/packages/pass/lib/api, auth, crypto and sync.

## Android adapter targets (create independently first)
- pass/eaglevault-api: DTOs, transport, identity, sync, cipher and folder APIs.
- pass/eaglevault-crypto: compatible KDF/key hierarchy and cipher encryption/decryption.
- pass/eaglevault-data: repositories and DTO/domain mappers.
- pass/eaglevault-session: login, refresh, lock/unlock and secure local session.
After tests pass, integrate incrementally with PassApiClient/RemoteApiGateway, PasswordManagerApi data sources, Room cache, Compose features, Autofill and biometrics.

## Acceptance tests
- KDF/encryption vectors pass on both platforms.
- Cross-platform fixtures: Web encrypt -> Android decrypt and Android encrypt -> Web decrypt.
- Login/refresh and cipher/folder CRUD pass against pinned Vaultwarden.
- /api/sync returns the same item to both clients.
- Server never stores plaintext sensitive fields.
- Lock clears decrypted in-memory state; unlock requires successful key derivation.
- Offline reads use encrypted cache; queued writes reconcile without silent overwrite.
- Upstream repositories remain clean until adapter tests pass.

## Immediate work order
1. Pin Vaultwarden and Bitwarden client commits; record license notices.
2. Identify GPL crypto implementation and platform dependencies; exclude commercial modules.
3. Extract DTOs from Vaultwarden route structs and matching GPL client code.
4. Write TypeScript and Android mock-HTTP API contract tests.
5. Implement crypto golden vectors before UI wiring.
6. Run the vertical slice on disposable Vaultwarden.
7. Integrate only after it passes.

## Audited baseline (point-in-time)
- android-pass: 60cf8cb0ae, main, clean at audit
- WebClients: 1e79445cef, main, clean at audit
- proton-pass-common: 806b7b9, main, clean at audit
- vaultwarden: 4051a4d3, main, clean at audit
- clients: a0c8970567, main, clean at audit
Re-check git status before every patch.
