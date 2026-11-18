import type {
  CipherDataDto,
  FolderDataDto,
  ListEnvelope,
  SyncResponseDto,
} from "../../../shared/contracts/bitwarden-api";

export interface VaultwardenClientOptions {
  serverUrl: string;
  accessToken: () => Promise<string>;
  fetchImpl?: typeof fetch;
}

export class VaultwardenApiError extends Error {
  readonly status: number;
  readonly responseBody: string;

  constructor(message: string, status: number, responseBody: string) {
    super(message);
    this.name = "VaultwardenApiError";
    this.status = status;
    this.responseBody = responseBody;
  }
}

export class VaultwardenClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly options: VaultwardenClientOptions;

  constructor(options: VaultwardenClientOptions) {
    this.options = options;
    const parsed = new URL(options.serverUrl);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
      throw new Error("Vaultwarden serverUrl must use HTTPS (HTTP is allowed only for localhost testing).");
    }
    this.baseUrl = parsed.toString().replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async sync(): Promise<SyncResponseDto> {
    return this.request<SyncResponseDto>("/sync", { method: "GET" });
  }

  async createCipher(cipher: CipherDataDto): Promise<CipherDataDto> {
    return this.request<CipherDataDto>("/ciphers", { method: "POST", body: JSON.stringify(cipher) });
  }

  async updateCipher(id: string, cipher: CipherDataDto): Promise<CipherDataDto> {
    return this.request<CipherDataDto>("/ciphers/" + encodeURIComponent(id), {
      method: "PUT",
      body: JSON.stringify(cipher),
    });
  }

  async deleteCipher(id: string): Promise<void> {
    await this.request<void>("/ciphers/" + encodeURIComponent(id), { method: "DELETE" });
  }

  async listFolders(): Promise<ListEnvelope<unknown>> {
    return this.request<ListEnvelope<unknown>>("/folders", { method: "GET" });
  }

  async createFolder(folder: FolderDataDto): Promise<unknown> {
    return this.request<unknown>("/folders", { method: "POST", body: JSON.stringify(folder) });
  }

  async renameFolder(id: string, folder: FolderDataDto): Promise<unknown> {
    return this.request<unknown>("/folders/" + encodeURIComponent(id), {
      method: "PUT",
      body: JSON.stringify(folder),
    });
  }

  async deleteFolder(id: string): Promise<void> {
    await this.request<void>("/folders/" + encodeURIComponent(id), { method: "DELETE" });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const token = await this.options.accessToken();
    const headers = new Headers(init.headers);
    headers.set("Authorization", "Bearer " + token);
    headers.set("Accept", "application/json");
    if (init.body !== undefined) headers.set("Content-Type", "application/json");

    const method = init.method ?? "GET";
    const response = await this.fetchImpl(this.baseUrl + "/api" + path, {
      ...init,
      headers,
      credentials: "omit",
      redirect: "error",
    });

    if (!response.ok) {
      const body = await response.text();
      throw new VaultwardenApiError(
        "Vaultwarden request failed: " + method + " " + path + " (" + response.status + ")",
        response.status,
        body,
      );
    }

    if (response.status === 204 || method === "DELETE") return undefined as T;
    const body = await response.text();
    return (body ? JSON.parse(body) : undefined) as T;
  }
}
