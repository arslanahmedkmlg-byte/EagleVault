import { parsePreloginKdf, type VaultKdf } from "./vaultwarden-prelogin.ts";

declare const EAGLEVAULT_API_URL: string;

const defaultCoreApiOrigin = typeof EAGLEVAULT_API_URL === "undefined"
  ? "https://api.eaglevault.eaglenet.asia"
  : EAGLEVAULT_API_URL;

export type VaultRecordKind = "item" | "folder";

export interface EncryptedVaultRecord {
  kind: VaultRecordKind;
  id: string;
  revision: number;
  ciphertext: string | null;
}

export interface VaultSyncPage {
  records: EncryptedVaultRecord[];
  cursor: number;
  hasMore: boolean;
}

export interface EncryptedVaultSnapshot {
  format: "eaglevault-encrypted-vault";
  version: number;
  revision: number;
  records: EncryptedVaultRecord[];
}

export interface CoreKdfConfiguration {
  emailSalt: string;
  kdf: VaultKdf;
}

export interface EagleVaultTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: "Bearer";
  Key: string;
}

interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export class EagleVaultApiError extends Error {
  readonly status: number;

  constructor(
    message: string,
    status: number,
  ) {
    super(message);
    this.name = "EagleVaultApiError";
    this.status = status;
  }
}

export class EagleVaultClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly stagingAccessKey?: string;
  private session: SessionTokens | undefined;

  constructor(
    baseUrl = defaultCoreApiOrigin,
    fetchImpl: typeof fetch = (...args) => globalThis.fetch(...args),
    stagingAccessKey?: string,
  ) {
    const parsed = new URL(baseUrl);
    if ((parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") ||
        parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") {
      throw new Error("EagleVault Core URL must be an HTTPS origin.");
    }
    this.baseUrl = parsed.origin;
    this.fetchImpl = fetchImpl;
    this.stagingAccessKey = stagingAccessKey;
  }

  get origin(): string {
    return this.baseUrl;
  }

  async register(email: string, authenticationHash: string, wrappedUserKey: string): Promise<void> {
    await this.request("/v1/accounts/register", {
      method: "POST",
      body: JSON.stringify({ email, authenticationHash, wrappedUserKey }),
    }, false);
  }

  async discoverKdf(email: string): Promise<CoreKdfConfiguration> {
    const normalizedEmail = email.trim().toLowerCase();
    const response = await this.request<{
      kdf?: number;
      kdfIterations?: number;
      kdfMemory?: number | null;
      kdfParallelism?: number | null;
      kdfSettings?: {
        kdfType?: number;
        iterations?: number;
        memory?: number | null;
        parallelism?: number | null;
      };
      salt?: string | null;
    }>("/api/accounts/prelogin", {
      method: "POST",
      body: JSON.stringify({ email: normalizedEmail }),
    }, false);
    return parsePreloginKdf(response, normalizedEmail);
  }

  async login(email: string, authenticationHash: string): Promise<EagleVaultTokenResponse> {
    const response = await this.request<EagleVaultTokenResponse>("/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, authenticationHash }),
    }, false);
    this.setSession(response);
    return response;
  }

  async refresh(): Promise<EagleVaultTokenResponse> {
    if (!this.session) throw new EagleVaultApiError("Your EagleVault session has expired. Sign in again.", 401);
    try {
      const response = await this.request<EagleVaultTokenResponse>("/v1/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refreshToken: this.session.refreshToken }),
      }, false);
      this.setSession(response);
      return response;
    } catch (error) {
      this.session = undefined;
      throw error;
    }
  }

  async sync(after = 0): Promise<VaultSyncPage[]> {
    const pages: VaultSyncPage[] = [];
    let cursor = after;
    do {
      const page = await this.request<VaultSyncPage>(
        `/v1/vault/sync?after=${encodeURIComponent(String(cursor))}&limit=100`,
        { method: "GET" },
      );
      pages.push(page);
      cursor = page.cursor;
    } while (pages.at(-1)?.hasMore);
    return pages;
  }

  async writeRecord(
    kind: VaultRecordKind,
    id: string,
    expectedRevision: number,
    ciphertext: string,
  ): Promise<number> {
    const response = await this.request<{ revision: number }>("/v1/vault/records", {
      method: "POST",
      body: JSON.stringify({ kind, id, expectedRevision, ciphertext }),
    });
    return response.revision;
  }

  async deleteRecord(kind: VaultRecordKind, id: string, expectedRevision: number): Promise<number> {
    const response = await this.request<{ revision: number }>(
      `/v1/vault/records/${kind}/${encodeURIComponent(id)}?expectedRevision=${expectedRevision}`,
      { method: "DELETE" },
    );
    return response.revision;
  }

  async exportVault(): Promise<EncryptedVaultSnapshot> {
    return this.request<EncryptedVaultSnapshot>("/v1/vault/export", { method: "GET" });
  }

  async logout(): Promise<void> {
    try {
      await this.request("/v1/auth/logout", { method: "POST" });
    } finally {
      this.session = undefined;
    }
  }

  clearSession(): void {
    this.session = undefined;
  }

  private setSession(response: EagleVaultTokenResponse): void {
    if (!response.access_token || !response.refresh_token ||
        !Number.isSafeInteger(response.expires_in) || response.expires_in < 1 ||
        response.token_type !== "Bearer" || typeof response.Key !== "string") {
      throw new EagleVaultApiError("The Core API returned an invalid session.", 502);
    }
    this.session = {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      expiresAt: Date.now() + response.expires_in * 1000,
    };
  }

  private async request<T>(
    path: string,
    init: RequestInit,
    authenticated = true,
    retried = false,
  ): Promise<T> {
    if (authenticated && this.session && this.session.expiresAt <= Date.now()) {
      await this.refresh();
    }
    const headers = new Headers({ Accept: "application/json" });
    if (init.body !== undefined) headers.set("Content-Type", "application/json");
    if (this.stagingAccessKey) headers.set("X-EagleVault-Staging-Key", this.stagingAccessKey);
    if (authenticated) {
      if (!this.session) throw new EagleVaultApiError("Sign in to continue.", 401);
      headers.set("Authorization", `Bearer ${this.session.accessToken}`);
    }

    const response = await this.fetchImpl(this.baseUrl + path, {
      ...init,
      headers,
      credentials: "omit",
      redirect: "error",
    });
    if (response.status === 401 && authenticated && !retried && this.session) {
      await this.refresh();
      return this.request<T>(path, init, authenticated, true);
    }
    if (!response.ok) {
      throw new EagleVaultApiError(
        `EagleVault Core request failed (${response.status}).`,
        response.status,
      );
    }
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return text ? JSON.parse(text) as T : undefined as T;
  }
}
