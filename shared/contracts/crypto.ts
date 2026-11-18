/**
 * Crypto boundary only; no implementation here.
 * Both platforms must match Bitwarden KDF, key hierarchy, cipher format and
 * official test vectors. Never log keys, plaintext or decrypted vault content.
 */
export interface KdfConfiguration { type: number; iterations?: number; memory?: number; parallelism?: number; }
export interface CryptoProvider {
  deriveMasterKey(password: string, email: string, kdf: KdfConfiguration): Promise<Uint8Array>;
  unlockUserKey(masterKey: Uint8Array, encryptedUserKey: string): Promise<Uint8Array>;
  decryptString(ciphertext: string, key: Uint8Array): Promise<string>;
  encryptString(plaintext: string, key: Uint8Array): Promise<string>;
  zeroize(bytes: Uint8Array): void;
}
export interface SessionTokens { accessToken: string; refreshToken?: string; expiresAt: number; }
