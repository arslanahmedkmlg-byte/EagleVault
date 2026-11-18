/** EagleVault domain contracts. These are app models, not wire DTOs. */
export type VaultItemType = "login" | "secure-note" | "card" | "identity" | "ssh-key" | "bank-account" | "drivers-license" | "passport";
export interface VaultItemBase {
  id: string;
  type: VaultItemType;
  name: string;
  notes?: string;
  favorite: boolean;
  folderId?: string;
  createdAt?: string;
  updatedAt?: string;
}
export interface LoginUri { uri: string; match?: number | null; uriChecksum?: string; }
export interface LoginItem extends VaultItemBase {
  type: "login";
  username?: string;
  password?: string;
  uris: LoginUri[];
  totp?: string;
}
export interface SecureNoteItem extends VaultItemBase { type: "secure-note"; noteType: number; }
export type VaultItem = LoginItem | SecureNoteItem | (VaultItemBase & {
  type: Exclude<VaultItemType, "login" | "secure-note">;
  data: Record<string, unknown>;
});
export interface VaultFolder { id: string; name: string; createdAt?: string; updatedAt?: string; }
export interface VaultSnapshot { items: VaultItem[]; folders: VaultFolder[]; syncedAt: string; }
export interface VaultRepository {
  list(): Promise<VaultSnapshot>;
  create(item: VaultItem): Promise<VaultItem>;
  update(item: VaultItem): Promise<VaultItem>;
  delete(itemId: string): Promise<void>;
  createFolder(name: string): Promise<VaultFolder>;
  renameFolder(folderId: string, name: string): Promise<VaultFolder>;
  deleteFolder(folderId: string): Promise<void>;
}
