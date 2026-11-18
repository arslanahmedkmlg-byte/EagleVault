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
export async function loginToVaultwarden(
  options: VaultwardenPasswordLoginOptions,
  cryptoProvider = new BitwardenCryptoProvider(),
): Promise<IdentityTokenResponse> {
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
    return await identity.passwordGrant({
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
  } finally {
    masterKey.fill(0);
  }
}
