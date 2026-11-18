# Shared crypto test vectors

These fixtures are synthetic and must never be used as real credentials or keys.

bitwarden-crypto-v1.json pins the expected output of the official Bitwarden SDK's PBKDF2 master-key derivation, authentication hash, and AES-256-CBC-HMAC decryption. Web and Android tests must consume the same fixture so crypto compatibility is checked across platforms rather than by each platform comparing its output to itself.

The fixed symmetric key is intentionally public test material. It is not suitable for protecting any data.
