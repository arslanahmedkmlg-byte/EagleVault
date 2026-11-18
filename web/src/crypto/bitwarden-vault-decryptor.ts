import type { BitwardenCryptoProvider } from "./bitwarden-crypto.ts";
import type { CipherDataDto } from "../../../shared/contracts/bitwarden-api.ts";

type StringRecord = Record<string, unknown>;

export interface DecryptedCipher {
  id: string;
  type: number;
  name: string;
  notes?: string | null;
  folderId?: string | null;
  favorite: boolean;
  archived: boolean;
  creationDate?: string | null;
  revisionDate?: string | null;
  login?: StringRecord | null;
  secureNote?: StringRecord | null;
  card?: StringRecord | null;
  identity?: StringRecord | null;
  sshKey?: StringRecord | null;
  bankAccount?: StringRecord | null;
  driversLicense?: StringRecord | null;
  passport?: StringRecord | null;
  fields?: StringRecord[] | null;
  passwordHistory?: StringRecord[] | null;
}

function isRecord(value: unknown): value is StringRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decryptOptional(value: unknown, key: Uint8Array, crypto: BitwardenCryptoProvider): unknown {
  if (typeof value !== "string" || value.length === 0) return value;
  return crypto.decryptString(value, key);
}

function decryptRecord(
  source: unknown,
  encryptedProperties: readonly string[],
  key: Uint8Array,
  crypto: BitwardenCryptoProvider,
): StringRecord | null {
  if (source === null || source === undefined) return null;
  if (!isRecord(source)) throw new Error("Cipher contains an invalid nested data object.");
  const result: StringRecord = { ...source };
  for (const property of encryptedProperties) {
    if (property in result) result[property] = decryptOptional(result[property], key, crypto);
  }
  return result;
}

function decodeKey(encoded: string): Uint8Array {
  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized);
  const key = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (key.byteLength !== 64) {
    key.fill(0);
    throw new Error("Cipher-specific key has an invalid length.");
  }
  return key;
}

const IDENTITY_ENCRYPTED_FIELDS = [
  "title", "firstName", "middleName", "lastName", "address1", "address2", "address3",
  "city", "state", "postalCode", "country", "company", "email", "phone", "ssn",
  "username", "passportNumber", "licenseNumber",
] as const;

const CARD_ENCRYPTED_FIELDS = [
  "cardholderName", "brand", "number", "expMonth", "expYear", "code", "pin",
] as const;

const SSH_ENCRYPTED_FIELDS = ["privateKey", "publicKey", "fingerprint"] as const;
const BANK_ACCOUNT_ENCRYPTED_FIELDS = [
  "accountName", "accountNumber", "routingNumber", "swiftCode", "iban", "bic",
  "sortCode", "accountType", "bankName", "branchName", "accountOwner", "country",
] as const;
const DRIVERS_LICENSE_ENCRYPTED_FIELDS = [
  "number", "issuedDate", "expirationDate", "issuedBy", "category", "country",
  "state", "licenseClass", "endorsements", "restrictions",
] as const;
const PASSPORT_ENCRYPTED_FIELDS = [
  "number", "country", "issueDate", "expirationDate", "placeOfIssue", "type",
  "name", "dateOfBirth", "issuingAuthority",
] as const;

/**
 * Decrypts a personal-vault Bitwarden Cipher using the official SDK.
 * Organization ciphers are rejected because they require organization keys.
 * The caller owns and must clear the returned plaintext values on lock/sign-out.
 */
export function decryptBitwardenCipher(
  cipher: CipherDataDto,
  userKey: Uint8Array,
  crypto: BitwardenCryptoProvider,
): DecryptedCipher {
  if (cipher.organizationId) {
    throw new Error("Organization ciphers require organization-key support.");
  }
  if (!cipher.id || !Number.isInteger(cipher.type)) {
    throw new Error("Cipher is missing its identifier or type.");
  }

  let itemKey = userKey;
  let ownsItemKey = false;
  if (cipher.key) {
    const encodedItemKey = crypto.decryptString(cipher.key, userKey);
    itemKey = decodeKey(encodedItemKey);
    ownsItemKey = true;
  }

  try {
    let login: StringRecord | null = null;
    if (cipher.login !== undefined && cipher.login !== null) {
      login = decryptRecord(cipher.login, ["username", "password", "totp"], itemKey, crypto);
      const uris = login?.uris;
      if (Array.isArray(uris)) {
        login!.uris = uris.map((entry) => {
          if (!isRecord(entry)) throw new Error("Cipher contains an invalid login URI.");
          return { ...entry, uri: decryptOptional(entry.uri, itemKey, crypto) };
        });
      }
    }

    let fields: StringRecord[] | null = null;
    if (cipher.fields !== undefined && cipher.fields !== null) {
      if (!Array.isArray(cipher.fields)) throw new Error("Cipher fields are not an array.");
      fields = cipher.fields.map((entry) => {
        if (!isRecord(entry)) throw new Error("Cipher contains an invalid custom field.");
        return {
          ...entry,
          name: decryptOptional(entry.name, itemKey, crypto),
          value: decryptOptional(entry.value, itemKey, crypto),
        };
      });
    }

    const passwordHistory = Array.isArray(cipher.passwordHistory)
      ? cipher.passwordHistory.map((entry) => {
          if (!isRecord(entry)) throw new Error("Cipher contains invalid password history.");
          return { ...entry, password: decryptOptional(entry.password, itemKey, crypto) };
        })
      : cipher.passwordHistory;

    return {
      id: cipher.id,
      type: cipher.type,
      name: String(decryptOptional(cipher.name, itemKey, crypto) ?? ""),
      notes: decryptOptional(cipher.notes, itemKey, crypto) as string | null | undefined,
      folderId: cipher.folderId,
      favorite: Boolean(cipher.favorite),
      archived: Boolean(cipher.archivedDate),
      creationDate: cipher.creationDate,
      revisionDate: cipher.revisionDate,
      login,
      secureNote: decryptRecord(cipher.secureNote, [], itemKey, crypto),
      card: decryptRecord(cipher.card, CARD_ENCRYPTED_FIELDS, itemKey, crypto),
      identity: decryptRecord(cipher.identity, IDENTITY_ENCRYPTED_FIELDS, itemKey, crypto),
      sshKey: decryptRecord(cipher.sshKey, SSH_ENCRYPTED_FIELDS, itemKey, crypto),
      bankAccount: decryptRecord(cipher.bankAccount, BANK_ACCOUNT_ENCRYPTED_FIELDS, itemKey, crypto),
      driversLicense: decryptRecord(cipher.driversLicense, DRIVERS_LICENSE_ENCRYPTED_FIELDS, itemKey, crypto),
      passport: decryptRecord(cipher.passport, PASSPORT_ENCRYPTED_FIELDS, itemKey, crypto),
      fields,
      ...(passwordHistory ? { passwordHistory } : {}),
    };
  } finally {
    if (ownsItemKey) itemKey.fill(0);
  }
}
