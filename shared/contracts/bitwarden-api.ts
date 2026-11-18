/**
 * Minimal DTOs based on Vaultwarden CipherData and FolderData source.
 * Encrypted values remain opaque. Expand only with route contract tests.
 * Source audit: Vaultwarden src/api/core/ciphers.rs and folders.rs, 2026-11-19.
 */
export interface CipherDataDto {
  id?: string | null;
  folderId?: string | null;
  organizationId?: string | null;
  key?: string | null;
  encryptedFor?: string | null;
  encryptedByKeyId?: string | null;
  type: number;
  name?: string | null;
  notes?: string | null;
  fields?: unknown;
  login?: unknown;
  secureNote?: unknown;
  card?: unknown;
  identity?: unknown;
  sshKey?: unknown;
  bankAccount?: unknown;
  driversLicense?: unknown;
  passport?: unknown;
  data?: string | null;
  favorite?: boolean | null;
  reprompt?: number | null;
  passwordHistory?: unknown;
  lastKnownRevisionDate?: string | null;
  archivedDate?: string | null;
}
export interface FolderDataDto { id?: string | null; name: string; }
export interface ListEnvelope<T> { data: T[]; object: string; continuationToken?: string | null; }
/** Keep unmodeled sync members opaque until deliberately mapped. */
export interface SyncResponseDto {
  profile?: unknown;
  folders?: unknown[];
  ciphers?: unknown[];
  collections?: unknown[];
  policies?: unknown[];
  domains?: unknown;
  sends?: unknown[];
  [key: string]: unknown;
}
