
## Identity and cryptography audit

- The client contract has separate password and refresh grants at `POST /identity/connect/token`.
- The Bitwarden client source defines PBKDF2-SHA256 as the default KDF with 600,000 iterations; Argon2id is also supported. KDF parameters must come from the server/pre-login response and be validated against downgrade limits.
- The legacy compatibility authentication hash is derived from the encryption-key portion of the master key using PBKDF2-SHA256 with one iteration and the user's master password as salt. It is not the plaintext master password.
- Vaultwarden stores encrypted cipher payloads; client encryption and key wrapping must match Bitwarden's protocol exactly.
- Do not implement a home-grown cipher or silently assume every account uses the default PBKDF2 settings.
- The imported Proton crypto worker/key manager is coupled to Proton account keys and is not a drop-in Vaultwarden crypto provider.
- Next safe implementation step is integrating the official Bitwarden-compatible SDK/crypto implementation with pinned versions and cross-platform test vectors, rather than approximating its algorithms.
