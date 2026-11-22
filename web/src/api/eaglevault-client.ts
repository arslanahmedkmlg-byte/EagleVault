import type { VaultKdf } from "./vaultwarden-prelogin.ts";

export interface VaultRecord {
  id: string;
  ciphertext: string | null;
  revision: number;
}

export interface VaultPage {
  records: VaultRecord[];
  cursor: number;
  hasMore: boolean;
}

export interface VaultWriteResult {
  status: "saved" | "conflict";
  revision: number;
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export class EagleVaultClient {
  private readonly origin: string;
  private readonly accessToken: () => Promise<string>;
  private readonly fetchImpl: typeof fetch;

  constructor(
    origin: string,
    accessToken: () => Promise<string>,
    fetchImpl: typeof fetch = fetch,
  ) {
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.username || url.password ||
        url.pathname !== "/" || url.search || url.hash) {
      throw new TypeError("EagleVault API requires an HTTPS origin.");
    }
    this.origin = url.origin;
    this.accessToken = accessToken;
    this.fetchImpl = fetchImpl;
  }

  async kdf(): Promise<VaultKdf> {
    return this.request<VaultKdf>("/v1/auth/kdf", undefined, false);
  }

  async register(email: string, proof: string, wrappedKey: string, registrationCode: string): Promise<void> {
    await this.auth("/v1/auth/register", { email, proof, wrappedKey, registrationCode });
  }

  async login(email: string, proof: string): Promise<SessionTokens & { wrappedKey: string }> {
    return this.auth("/v1/auth/login", { email, proof });
  }

  async refresh(refreshToken: string): Promise<SessionTokens> {
    return this.auth("/v1/auth/refresh", { refreshToken });
  }

  async logout(refreshToken: string): Promise<void> {
    await this.auth("/v1/auth/logout", { refreshToken });
  }

  private async auth<T>(path: string, body: Record<string, string>): Promise<T> {
    return this.request<T>(path, { method: "POST", body: JSON.stringify(body) }, false);
  }

  async sync(after = 0, limit = 25): Promise<VaultPage> {
    return this.request<VaultPage>(`/v1/vault/sync?after=${after}&limit=${limit}`);
  }

  async write(id: string, expectedRevision: number, ciphertext: string | null): Promise<VaultWriteResult> {
    return this.request<VaultWriteResult>(`/v1/vault/records/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({ expectedRevision, ciphertext }),
    });
  }

  private async request<T>(path: string, options?: RequestInit, authenticated = true): Promise<T> {
    const response = await this.fetchImpl(this.origin + path, {
      ...options,
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
      headers: {
        ...(authenticated ? { authorization: `Bearer ${await this.accessToken()}` } : {}),
        ...(options?.body ? { "content-type": "application/json" } : {}),
      },
    });
    if (!response.ok && !(response.status === 409 && options?.method === "PUT")) {
      throw new Error(`EagleVault API returned HTTP ${response.status}.`);
    }
    return response.json();
  }
}
