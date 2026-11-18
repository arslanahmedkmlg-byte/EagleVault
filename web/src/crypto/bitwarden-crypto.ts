import { PureCrypto } from "@bitwarden/sdk-internal";
import type { Kdf } from "@bitwarden/sdk-internal";
import type { VaultKdf } from "../api/vaultwarden-prelogin.ts";

const encoder = new TextEncoder();

function toSdkKdf(config: VaultKdf): Kdf {
  if (config.type === "pbkdf2-sha256") {
    if (!Number.isInteger(config.iterations) || config.iterations < 5000 || config.iterations > 2_000_000) {
      throw new Error("PBKDF2 parameters are outside the accepted pre-login range.");
    }
    return { pBKDF2: { iterations: config.iterations } };
  }
  if (!Number.isInteger(config.iterations) || config.iterations < 2 || config.iterations > 10 ||
      !Number.isInteger(config.memory) || config.memory < 16 || config.memory > 1024 ||
      !Number.isInteger(config.parallelism) || config.parallelism < 1 || config.parallelism > 16) {
    throw new Error("Argon2id parameters are outside the accepted pre-login range.");
  }
  return {
    argon2id: {
      iterations: config.iterations,
      memory: config.memory,
      parallelism: config.parallelism,
    },
  };
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Thin adapter around Bitwarden's published GPL-3.0 SDK crypto primitives.
 * This deliberately does not persist passwords, derived keys, or vault contents.
 *
 * The Web application must initialize the SDK WASM module before calling this
 * provider. See docs/CRYPTO-SDK-INTEGRATION.md for the browser bootstrap contract.
 */
export class BitwardenCryptoProvider {
  deriveMasterKey(password: string, email: string, kdf: VaultKdf): Uint8Array {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      throw new Error("A valid normalized account email is required.");
    }
    return PureCrypto.derive_kdf_material(
      encoder.encode(password),
      encoder.encode(normalizedEmail),
      toSdkKdf(kdf),
    );
  }

  async deriveMasterPasswordAuthenticationHash(
    password: string,
    masterKey: Uint8Array,
  ): Promise<string> {
    if (masterKey.byteLength !== 32) {
      throw new Error("The Bitwarden master key must be exactly 32 bytes.");
    }
    // Copy the SDK-owned Uint8Array into a fresh ArrayBuffer-backed view.
    // TS 6's DOM BufferSource types correctly reject ArrayBufferLike/SharedArrayBuffer.
    const rawMasterKey = new Uint8Array(masterKey.byteLength);
    rawMasterKey.set(masterKey);
    const key = await crypto.subtle.importKey(
      "raw",
      rawMasterKey.buffer,
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const hash = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: encoder.encode(password),
        iterations: 1,
      },
      key,
      256,
    );
    return toBase64(new Uint8Array(hash));
  }

  generateUserKey(): Uint8Array {
    return PureCrypto.make_user_key_aes256_cbc_hmac();
  }

  encryptUserKeyWithMasterPassword(
    userKey: Uint8Array,
    password: string,
    email: string,
    kdf: VaultKdf,
  ): string {
    if (userKey.byteLength !== 64) {
      throw new Error("The Bitwarden AES-256-CBC-HMAC user key must be 64 bytes.");
    }
    return PureCrypto.encrypt_user_key_with_master_password(
      userKey,
      password,
      email.trim().toLowerCase(),
      toSdkKdf(kdf),
    );
  }

  decryptUserKeyWithMasterPassword(
    encryptedUserKey: string,
    password: string,
    email: string,
    kdf: VaultKdf,
  ): Uint8Array {
    const userKey = PureCrypto.decrypt_user_key_with_master_password(
      encryptedUserKey,
      password,
      email.trim().toLowerCase(),
      toSdkKdf(kdf),
    );
    if (userKey.byteLength !== 64) {
      userKey.fill(0);
      throw new Error("Decrypted user key has an invalid length.");
    }
    return userKey;
  }

  encryptString(plaintext: string, userKey: Uint8Array): string {
    if (userKey.byteLength !== 64) {
      throw new Error("A 64-byte AES-256-CBC-HMAC user key is required.");
    }
    return PureCrypto.symmetric_encrypt_string(plaintext, userKey);
  }

  decryptString(ciphertext: string, userKey: Uint8Array): string {
    if (userKey.byteLength !== 64) {
      throw new Error("A 64-byte AES-256-CBC-HMAC user key is required.");
    }
    return PureCrypto.symmetric_decrypt_string(ciphertext, userKey);
  }
}
