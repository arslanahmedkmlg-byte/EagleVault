# Bitwarden-compatible cryptography integration

## Selected implementation

EagleVault Web uses the official Bitwarden SDK crypto implementation rather than a reimplementation:

- npm package: `@bitwarden/sdk-internal`
- pinned version: `0.2.0-main.1244`
- SDK source revision embedded in the package: `8da8618f9cbefbfdd26c0a300b0743081afa232f`
- package license: GPL-3.0
- source: https://github.com/bitwarden/sdk-internal
- package is explicitly described by Bitwarden as internal-use and unsupported; pin it and validate upgrades before adopting them.

The package is WASM-backed in browsers. The application must call `initializeBitwardenCryptoSdk()` once during startup before invoking `BitwardenCryptoProvider`. The loader mirrors the official Bitwarden Web client pattern: load the WASM build, call SDK `init`, then `init_sdk`.

## Implemented Web crypto operations

`web/src/crypto/bitwarden-crypto.ts` delegates the actual cryptographic primitives to Bitwarden's SDK:

- PBKDF2-SHA256 and Argon2id master-key derivation using server-provided KDF parameters.
- Bitwarden master-password authentication hash (PBKDF2-SHA256, one iteration, master-key encryption-key portion as input and master password as salt).
- AES-256-CBC-HMAC user-key generation.
- User-key wrapping and unwrapping using the Bitwarden SDK.
- Field string encryption and decryption using the SDK's AES-256-CBC-HMAC format.

KDF parameters are range-checked both when pre-login data is parsed and again at the crypto boundary. The password login orchestrator performs pre-login, derives the authentication hash, submits the identity password grant, and zeroes the temporary master-key byte array in a finally block.

The identity client keeps unauthenticated token requests separate from the bearer-authenticated vault API client. It supports password and refresh grants and optional two-factor fields. Token persistence, refresh rotation policy, and unlock-state persistence are not yet implemented.

## Android implementation direction

The same official SDK repository provides Kotlin UniFFI bindings in `crates/bitwarden-uniffi/kotlin/sdk`. Its Android SDK is built from Rust with Android cross-compilation (four Android ABIs) and generated Kotlin bindings. This is the correct shared crypto implementation to use on Android; do not port the Web algorithms into Kotlin separately.

The development device currently has no JDK, Rust toolchain, or Android NDK installed. Therefore the Android native SDK has been source-audited but not built or integrated. The existing Android API adapter remains transport-only. The next Android milestone is to provision the documented toolchain or consume a verified, commit-matched official Android SDK artifact, then wire its Kotlin crypto client behind EagleVault's crypto interface.

## Verification performed

The Web contract suite uses the SDK's Node WASM build and synthetic test fixtures. It verifies PBKDF2 and Argon2id derivation, authentication hash derivation, user-key wrap/unwrap, AES-256-CBC-HMAC field round-trip, KDF rejection, password grant sequencing, and refresh grant serialization.

Run:

```sh
cd EagleVault
node --experimental-strip-types --test tests/contracts/*.test.mjs
```

Do not use real credentials in these tests. No live Vaultwarden account was accessed.
