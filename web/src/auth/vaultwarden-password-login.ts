import { fetchVaultwardenPrelogin } from "../api/vaultwarden-prelogin.ts";
import { VaultwardenIdentityClient, type IdentityTokenResponse } from "../api/vaultwarden-identity-client.ts";
import { BitwardenCryptoProvider } from "../crypto/bitwarden-crypto.ts";

export interface VaultwardenPasswordLoginOptions {
  serverUrl: string;
  email: string;
  masterPassword: string;
  clientId: string;
  deviceIdentifier: string;
  deviceName: string;
  deviceType: string;
  twoFactorToken?: string;
  twoFactorProvider?: number;
  twoFactorRemember?: boolean;
  fetchImpl?: typeof fetch;
}

/**
 * Performs server-directed KDF discovery, Bitwarden-compatible derivation,
 * then the unauthenticated identity password grant. It does not persist tokens.
 */
export interface VaultwardenUnlockedSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  userKey: Uint8Array;
}

export async function loginToVaultwarden(
  options: VaultwardenPasswordLoginOptions,
  cryptoProvider = new BitwardenCryptoProvider(),
): Promise<VaultwardenUnlockedSession> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const prelogin = await fetchVaultwardenPrelogin(options.serverUrl, options.email, fetchImpl);
  const masterKey = cryptoProvider.deriveMasterKey(
    options.masterPassword,
    prelogin.emailSalt,
    prelogin.kdf,
  );

  try {
    const authenticationHash = await cryptoProvider.deriveMasterPasswordAuthenticationHash(
      options.masterPassword,
      masterKey,
    );
    const identity = new VaultwardenIdentityClient(options.serverUrl, fetchImpl);
    const tokens: IdentityTokenResponse = await identity.passwordGrant({
      username: options.email,
      authenticationHash,
      clientId: options.clientId,
      deviceIdentifier: options.deviceIdentifier,
      deviceName: options.deviceName,
      deviceType: options.deviceType,
      twoFactorToken: options.twoFactorToken,
      twoFactorProvider: options.twoFactorProvider,
      twoFactorRemember: options.twoFactorRemember,
    });
    const encryptedUserKey =
      tokens.Key ??
      tokens.UserDecryptionOptions?.MasterPasswordUnlock?.MasterKeyWrappedUserKey ??
      tokens.UserDecryptionOptions?.MasterPasswordUnlock?.MasterKeyEncryptedUserKey;
    if (!encryptedUserKey) {
      throw new Error("Vaultwarden authenticated the account but did not return a master-password-wrapped user key.");
    }
    const userKey = cryptoProvider.decryptUserKeyWithMasterPassword(
      encryptedUserKey,
      options.masterPassword,
      prelogin.emailSalt,
      prelogin.kdf,
    );
    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
      token_type: tokens.token_type,
      ...(tokens.scope ? { scope: tokens.scope } : {}),
      userKey,
    };
  } finally {
    masterKey.fill(0);
  }
}
