/**
 * Minimal DTOs based on Vaultwarden CipherData and FolderData source.
 * Encrypted values remain opaque. Expand only with route contract tests.
 * Source audit: Vaultwarden src/api/core/ciphers.rs and folders.rs, 2026-11-19.
 */

export interface CipherUriDto {
  uri?: string | null;
  match?: number | null;
  [key: string]: unknown;
}

export interface CipherLoginDto {
  username?: string | null;
  password?: string | null;
  totp?: string | null;
  uris?: CipherUriDto[] | null;
  [key: string]: unknown;
}

export interface CipherFieldDto {
  name?: string | null;
  value?: string | null;
  type?: number | null;
  linkedId?: number | null;
  [key: string]: unknown;
}

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
  fields?: CipherFieldDto[] | null;
  login?: CipherLoginDto | null;
  secureNote?: Record<string, unknown> | null;
  card?: Record<string, unknown> | null;
  identity?: Record<string, unknown> | null;
  sshKey?: Record<string, unknown> | null;
  bankAccount?: Record<string, unknown> | null;
  driversLicense?: Record<string, unknown> | null;
  passport?: Record<string, unknown> | null;
  data?: string | null;
  favorite?: boolean | null;
  reprompt?: number | null;
  passwordHistory?: Array<Record<string, unknown>> | null;
  creationDate?: string | null;
  revisionDate?: string | null;
  lastKnownRevisionDate?: string | null;
  deletedDate?: string | null;
  archivedDate?: string | null;
}

export interface FolderDataDto {
  id?: string | null;
  name: string;
}

export interface ListEnvelope<T> {
  data: T[];
  object: string;
  continuationToken?: string | null;
}

/** Keep unmodeled sync members opaque until deliberately mapped. */
export interface SyncResponseDto {
  profile?: unknown;
  folders?: FolderDataDto[];
  ciphers?: CipherDataDto[];
  collections?: unknown[];
  policies?: unknown[];
  domains?: unknown;
  sends?: unknown[];
  [key: string]: unknown;
}
