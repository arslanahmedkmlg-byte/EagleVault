
# Security implementation gate

EagleVault must not enable account creation, login, or vault writes until all of these are complete:

1. Parse the server's pre-login KDF type and parameters. Support both PBKDF2-SHA256 and Argon2id as required by the account; reject invalid or downgraded parameters.
2. Derive the master key with a vetted Bitwarden-compatible implementation.
3. Derive the authentication hash using the exact Bitwarden-compatible construction; never submit the plaintext master password.
4. Generate and wrap the user key using the expected AES-256-CBC-HMAC format.
5. Encrypt cipher fields and cipher keys in the exact format expected by Bitwarden clients.
6. Store access and refresh tokens using platform secure storage; never log tokens, passwords, derived keys, or decrypted vault data.
7. Verify Web and Android against the same deterministic test vectors and a disposable Vaultwarden instance.
8. Test login failures, 2FA, refresh rotation, KDF mismatch, corrupted ciphertext, and sync conflict handling.

## Explicitly not implemented

The current transport layer is not a password manager by itself. It does not yet implement pre-login, KDF derivation, key hierarchy, vault encryption/decryption, secure token persistence, full DTO conversion, or UI integration. Keep these features disabled until the gate above passes.
