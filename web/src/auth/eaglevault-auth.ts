import { EagleVaultClient } from "../api/eaglevault-client.ts";
import { BitwardenCryptoProvider } from "../crypto/bitwarden-crypto.ts";

export interface UnlockedEagleVaultSession {
  email: string;
  client: EagleVaultClient;
  userKey: Uint8Array<ArrayBuffer>;
}

function copyUserKey(userKey: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(userKey.length);
  copy.set(userKey);
  userKey.fill(0);
  return copy;
}

export async function registerEagleVaultAccount(
  client: EagleVaultClient,
  email: string,
  masterPassword: string,
  cryptoProvider = new BitwardenCryptoProvider(),
): Promise<UnlockedEagleVaultSession> {
  const normalizedEmail = email.trim().toLowerCase();
  const { kdf } = await client.discoverKdf(normalizedEmail);
  const masterKey = cryptoProvider.deriveMasterKey(masterPassword, normalizedEmail, kdf);
  const userKey = cryptoProvider.generateUserKey();
  try {
    const authenticationHash = await cryptoProvider.deriveMasterPasswordAuthenticationHash(
      masterPassword,
      masterKey,
    );
    const wrappedUserKey = cryptoProvider.encryptUserKeyWithMasterPassword(
      userKey,
      masterPassword,
      normalizedEmail,
      kdf,
    );
    await client.register(normalizedEmail, authenticationHash, wrappedUserKey);
    const tokens = await client.login(normalizedEmail, authenticationHash);
    const unlockedKey = cryptoProvider.decryptUserKeyWithMasterPassword(
      tokens.Key,
      masterPassword,
      normalizedEmail,
      kdf,
    );
    return { email: normalizedEmail, client, userKey: copyUserKey(unlockedKey) };
  } catch (error) {
    client.clearSession();
    throw error;
  } finally {
    userKey.fill(0);
    masterKey.fill(0);
  }
}

export async function loginToEagleVault(
  client: EagleVaultClient,
  email: string,
  masterPassword: string,
  cryptoProvider = new BitwardenCryptoProvider(),
): Promise<UnlockedEagleVaultSession> {
  const normalizedEmail = email.trim().toLowerCase();
  const { kdf } = await client.discoverKdf(normalizedEmail);
  const masterKey = cryptoProvider.deriveMasterKey(masterPassword, normalizedEmail, kdf);
  try {
    const authenticationHash = await cryptoProvider.deriveMasterPasswordAuthenticationHash(
      masterPassword,
      masterKey,
    );
    const tokens = await client.login(normalizedEmail, authenticationHash);
    const unlockedKey = cryptoProvider.decryptUserKeyWithMasterPassword(
      tokens.Key,
      masterPassword,
      normalizedEmail,
      kdf,
    );
    return { email: normalizedEmail, client, userKey: copyUserKey(unlockedKey) };
  } catch (error) {
    client.clearSession();
    throw error;
  } finally {
    masterKey.fill(0);
  }
}
