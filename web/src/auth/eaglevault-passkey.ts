/**
 * Optional local passkey vault unlock.
 * WebAuthn PRF output protects the user key and rotating refresh token at rest.
 * This is NOT a server-side WebAuthn login, and requires the same browser profile.
 * Password login remains the fallback.
 */
const STORAGE_KEY = 'eaglevault:passkey-unlock:v1';

export interface LocalPasskeyRecord {
  version: 1;
  email: string;
  credentialId: string;
  salt: string;
  iv: string;
  ciphertext: string;
}

export interface ProtectedUnlock {
  email: string;
  userKey: Uint8Array<ArrayBuffer>;
  refreshToken: string;
  wrappingKey: CryptoKey;
  record: LocalPasskeyRecord;
}

const encoder = new TextEncoder();
const toBase64 = (value: Uint8Array): string => {
  let text = '';
  for (const byte of value) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromBase64 = (value: string): Uint8Array<ArrayBuffer> => {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid passkey record.');
  const encoded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(encoded + '='.repeat((4 - encoded.length % 4) % 4));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
};
const randomBytes = (size: number): Uint8Array<ArrayBuffer> => crypto.getRandomValues(new Uint8Array(size));
const aad = (email: string): Uint8Array<ArrayBuffer> =>
  encoder.encode('EagleVault local passkey v1|' + location.origin + '|' + email.toLowerCase());

function ensureSupported(): void {
  if (!window.isSecureContext || !window.PublicKeyCredential || !navigator.credentials ||
      !crypto.subtle || !window.localStorage) {
    throw new Error('This browser does not support secure passkey unlock. Use your master password.');
  }
}

export function existingPasskeyUnlock(): LocalPasskeyRecord | null {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (!text) return null;
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || !parsed) return null;
    const record = parsed as Partial<LocalPasskeyRecord>;
    if (record.version !== 1 ||
        ![record.email, record.credentialId, record.salt, record.iv, record.ciphertext]
          .every(value => typeof value === 'string' && value.length > 0)) return null;
    return record as LocalPasskeyRecord;
  } catch {
    return null;
  }
}

export function removePasskeyUnlock(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export async function derivePasskeyKey(credential: PublicKeyCredential): Promise<CryptoKey> {
  const extensions = credential.getClientExtensionResults() as AuthenticationExtensionsClientOutputs & {
    prf?: { results?: { first?: ArrayBuffer } };
  };
  const first = extensions.prf?.results?.first;
  if (!(first instanceof ArrayBuffer) || first.byteLength !== 32) {
    throw new Error('This phone or browser cannot use its passkey to protect vault keys. Use your master password.');
  }
  const raw = new Uint8Array(first.slice(0));
  try {
    return await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  } finally {
    raw.fill(0);
  }
}

async function requestPasskey(credentialId: Uint8Array<ArrayBuffer>, salt: Uint8Array<ArrayBuffer>): Promise<PublicKeyCredential> {
  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      allowCredentials: [{ id: credentialId, type: 'public-key' }],
      userVerification: 'required',
      timeout: 60000,
      extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs,
    },
  });
  if (!(credential instanceof PublicKeyCredential)) {
    throw new Error('Passkey verification was cancelled.');
  }
  if (toBase64(new Uint8Array(credential.rawId)) !== toBase64(credentialId)) {
    throw new Error('The device returned a different passkey.');
  }
  const auth = credential.response as AuthenticatorAssertionResponse;
  const flags = new Uint8Array(auth.authenticatorData)[32];
  if ((flags & 4) === 0) throw new Error('Device screen-lock verification is required.');
  return credential;
}

async function seal(record: LocalPasskeyRecord, key: CryptoKey, refreshToken: string, userKey: Uint8Array): Promise<LocalPasskeyRecord> {
  const iv = randomBytes(12);
  const clear = encoder.encode(JSON.stringify({
    email: record.email,
    refreshToken,
    userKey: toBase64(userKey),
  }));
  try {
    const encrypted = await crypto.subtle.encrypt({
      name: 'AES-GCM', iv, additionalData: aad(record.email), tagLength: 128,
    }, key, clear);
    return { ...record, iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(encrypted)) };
  } finally {
    clear.fill(0);
  }
}

export async function enablePasskeyUnlock(email: string, userKey: Uint8Array, refreshToken: string): Promise<ProtectedUnlock> {
  ensureSupported();
  const salt = randomBytes(32);
  const created = await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: 'EagleVault', id: location.hostname },
      user: {
        id: randomBytes(32), name: email.toLowerCase(), displayName: email.toLowerCase(),
      },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'required', userVerification: 'required' },
      timeout: 60000,
      attestation: 'none',
      extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs,
    },
  });
  if (!(created instanceof PublicKeyCredential)) throw new Error('Passkey enrollment was cancelled.');
  const verification = await requestPasskey(new Uint8Array(created.rawId), salt);
  const wrappingKey = await derivePasskeyKey(verification);
  const base: LocalPasskeyRecord = {
    version: 1, email: email.toLowerCase(), credentialId: toBase64(new Uint8Array(created.rawId)),
    salt: toBase64(salt), iv: '', ciphertext: '',
  };
  const record = await seal(base, wrappingKey, refreshToken, userKey);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  return { email: base.email, userKey: new Uint8Array(userKey), refreshToken, wrappingKey, record };
}

export async function unlockWithPasskey(): Promise<ProtectedUnlock> {
  ensureSupported();
  const record = existingPasskeyUnlock();
  if (!record) throw new Error('Passkey unlock is not configured on this device.');
  const credential = await requestPasskey(fromBase64(record.credentialId), fromBase64(record.salt));
  const wrappingKey = await derivePasskeyKey(credential);
  try {
    const plaintext = await crypto.subtle.decrypt({
      name: 'AES-GCM', iv: fromBase64(record.iv), additionalData: aad(record.email), tagLength: 128,
    }, wrappingKey, fromBase64(record.ciphertext));
    const bytes = new Uint8Array(plaintext);
    try {
      const parsed = JSON.parse(new TextDecoder().decode(bytes)) as {
        email?: string; userKey?: string; refreshToken?: string;
      };
      if (parsed.email !== record.email || typeof parsed.refreshToken !== 'string' ||
          !/^evr1\.[0-9a-f]{64}\.[A-Za-z0-9_-]{43}$/.test(parsed.refreshToken) ||
          typeof parsed.userKey !== 'string') throw new Error('Invalid protected vault session.');
      const userKey = fromBase64(parsed.userKey);
      if (userKey.byteLength !== 64) throw new Error('Invalid protected vault key.');
      return { email: record.email, userKey, refreshToken: parsed.refreshToken, wrappingKey, record };
    } finally {
      bytes.fill(0);
    }
  } catch {
    throw new Error('Passkey unlock failed. Sign in with your master password.');
  }
}

export async function updateProtectedSession(session: ProtectedUnlock, refreshToken: string): Promise<void> {
  // Avoid overwriting a revoked or replaced local passkey from an in-flight refresh.
  if (existingPasskeyUnlock()?.credentialId !== session.record.credentialId) return;
  const updated = await seal(session.record, session.wrappingKey, refreshToken, session.userKey);
  if (existingPasskeyUnlock()?.credentialId !== session.record.credentialId) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  session.record = updated;
}
