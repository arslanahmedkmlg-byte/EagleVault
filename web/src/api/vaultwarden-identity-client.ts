export interface IdentityTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  Key?: string;
  UserDecryptionOptions?: {
    MasterPasswordUnlock?: {
      MasterKeyEncryptedUserKey?: string;
      MasterKeyWrappedUserKey?: string;
      Salt?: string;
    } | null;
  };
}

export interface PasswordGrant {
  username: string;
  authenticationHash: string;
  clientId: string;
  deviceIdentifier: string;
  deviceName: string;
  deviceType: string;
  twoFactorToken?: string;
  twoFactorProvider?: number;
  twoFactorRemember?: boolean;
}

/** Unauthenticated OAuth-style identity requests, isolated from vault API tokens. */
export class VaultwardenIdentityClient {
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;

  constructor(serverUrl: string, fetchImpl: typeof fetch = (...args) => globalThis.fetch(...args)) {
    const base = new URL(serverUrl);
    if (base.protocol !== "https:" && base.hostname !== "localhost" && base.hostname !== "127.0.0.1") {
      throw new Error("Vaultwarden server URL must use HTTPS.");
    }
    this.endpoint = base.toString().replace(/\/$/, "") + "/identity/connect/token";
    this.fetchImpl = fetchImpl;
  }

  async passwordGrant(input: PasswordGrant): Promise<IdentityTokenResponse> {
    const form = new URLSearchParams({
      grant_type: "password",
      username: input.username.trim().toLowerCase(),
      password: input.authenticationHash,
      client_id: input.clientId,
      scope: "api offline_access",
      device_identifier: input.deviceIdentifier,
      device_name: input.deviceName,
      device_type: input.deviceType,
    });
    if (input.twoFactorToken) form.set("two_factor_token", input.twoFactorToken);
    if (input.twoFactorProvider !== undefined) form.set("two_factor_provider", String(input.twoFactorProvider));
    if (input.twoFactorRemember !== undefined) form.set("two_factor_remember", input.twoFactorRemember ? "1" : "0");

    return this.send(form);
  }

  async refreshGrant(refreshToken: string, clientId: string): Promise<IdentityTokenResponse> {
    return this.send(new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
    }));
  }

  private async send(form: URLSearchParams): Promise<IdentityTokenResponse> {
    const email = form.get("username");
    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "Bitwarden-Client-Name": "web",
      "Bitwarden-Client-Version": "1.0.0",
      "Device-Type": form.get("device_type") ?? "",
      "Device-Identifier": form.get("device_identifier") ?? "",
      "Device-Name": form.get("device_name") ?? "",
    };
    if (email) {
      const bytes = new TextEncoder().encode(email);
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      headers["Auth-Email"] = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers,
      body: form.toString(),
      credentials: "omit",
      redirect: "error",
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error("Vaultwarden identity request failed with HTTP " + response.status + ": " + body);
    }
    return await response.json() as IdentityTokenResponse;
  }
}
