import { EagleVaultClient, type SessionTokens } from "../api/eaglevault-client.ts";
import type { VaultKdf } from "../api/vaultwarden-prelogin.ts";
import { BitwardenCryptoProvider } from "../crypto/bitwarden-crypto.ts";

export interface VaultEntryFields {
  kind: "login" | "note" | "folder";
  name: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  folderId: string;
}

export interface VaultEntry extends VaultEntryFields {
  id: string;
  revision: number;
}

const provider = new BitwardenCryptoProvider();

async function proofFor(email: string, password: string, kdf: VaultKdf) {
  const master = provider.deriveMasterKey(password, email, kdf);
  try {
    return await provider.deriveMasterPasswordAuthenticationHash(password, master);
  } finally {
    master.fill(0);
  }
}

export class EagleVaultSession {
  private tokens: SessionTokens | null = null;
  private key: Uint8Array | null = null;
  private refreshing: Promise<SessionTokens> | null = null;
  private readonly client: EagleVaultClient;

  constructor(origin: string, fetchImpl?: typeof fetch) {
    this.client = new EagleVaultClient(origin, () => this.accessToken(), fetchImpl);
  }

  async unlock(email: string, password: string, registrationCode?: string) {
    if (this.tokens || this.key) throw new Error("Vault is already unlocked.");
    email = email.trim().toLowerCase();
    const kdf = await this.client.kdf();
    if (kdf.type !== "argon2id" || kdf.iterations !== 3 || kdf.memory !== 64 || kdf.parallelism !== 4) {
      throw new Error("This server returned unsupported key derivation settings.");
    }
    const proof = await proofFor(email, password, kdf);
    if (registrationCode !== undefined) {
      const key = provider.generateUserKey();
      try {
        const wrappedKey = provider.encryptUserKeyWithMasterPassword(key, password, email, kdf);
        await this.client.register(email, proof, wrappedKey, registrationCode);
      } finally {
        key.fill(0);
      }
    }
    const { wrappedKey, ...tokens } = await this.client.login(email, proof);
    try {
      this.key = provider.decryptUserKeyWithMasterPassword(wrappedKey, password, email, kdf);
      this.tokens = tokens;
    } catch (error) {
      await this.client.logout(tokens.refreshToken).catch(() => {});
      throw error;
    }
  }

  async lock() {
    const tokens = this.tokens;
    this.tokens = null;
    this.key?.fill(0);
    this.key = null;
    if (tokens) {
      const latest = await this.refreshing?.catch(() => tokens) ?? tokens;
      await this.client.logout(latest.refreshToken);
    }
  }

  async sync() {
    const entries = new Map<string, VaultEntry>();
    let cursor = 0;
    for (;;) {
      const page = await this.client.sync(cursor);
      for (const record of page.records) {
        if (record.ciphertext === null) {
          entries.delete(record.id);
          continue;
        }
        const decoded = JSON.parse(provider.decryptString(record.ciphertext, this.requireKey()));
        if (decoded.version !== 1 || decoded.id !== record.id ||
            !["login", "note", "folder"].includes(decoded.kind) ||
            !["name", "username", "password", "url", "notes", "folderId"].every(
              field => typeof decoded[field] === "string")) {
          throw new Error("Vault record failed validation.");
        }
        const { kind, name, username, password, url, notes, folderId } = decoded;
        entries.set(record.id, { kind, name, username, password, url, notes, folderId, id: record.id, revision: record.revision });
      }
      if (!page.hasMore) return Array.from(entries.values());
      if (page.cursor <= cursor) throw new Error("Invalid vault sync cursor.");
      cursor = page.cursor;
    }
  }

  async save(fields: VaultEntryFields, previous?: VaultEntry) {
    const id = previous?.id ?? crypto.randomUUID();
    const ciphertext = provider.encryptString(JSON.stringify({ ...fields, version: 1, id }), this.requireKey());
    const result = await this.client.write(id, previous?.revision ?? 0, ciphertext);
    if (result.status === "conflict") throw new Error("This item changed elsewhere. Sync before editing it again.");
  }

  async delete(entry: VaultEntry) {
    this.requireKey();
    const result = await this.client.write(entry.id, entry.revision, null);
    if (result.status === "conflict") throw new Error("This item changed elsewhere. Sync before deleting it.");
  }

  private requireKey() {
    if (!this.key) throw new Error("Vault is locked.");
    return this.key;
  }

  private async accessToken() {
    const tokens = this.tokens;
    if (!tokens) throw new Error("Vault is locked.");
    if (tokens.expiresAt - Date.now() > 30_000) return tokens.accessToken;
    const refresh = this.refreshing ??= this.client.refresh(tokens.refreshToken);
    try {
      const rotated = await refresh;
      if (!this.tokens) throw new Error("Vault is locked.");
      if (this.tokens === tokens) this.tokens = rotated;
      return rotated.accessToken;
    } finally {
      if (this.refreshing === refresh) this.refreshing = null;
    }
  }
}
