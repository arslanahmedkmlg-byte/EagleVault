// Cloudflare Web Crypto rejects PBKDF2 iteration counts above 100,000.
const verifierIterations = 100_000;

export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export async function derivePasswordVerifier(authenticationHash, salt) {
  const key = await crypto.subtle.importKey('raw', authenticationHash, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    salt,
    iterations: verifierIterations,
    hash: 'SHA-256',
  }, key, 256);
  return new Uint8Array(bits);
}

export async function readBoundedJson(request, limit) {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json' ||
      !request.body) return null;
  const reader = request.body.getReader();
  const bytes = new Uint8Array(limit);
  let offset = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (offset + value.length > bytes.length) {
        await reader.cancel();
        return null;
      }
      bytes.set(value, offset);
      offset += value.length;
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, offset)));
  } catch {
    return null;
  } finally {
    bytes.fill(0);
    reader.releaseLock();
  }
}

export async function readBoundedText(request, limit) {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const bytes = new Uint8Array(limit);
  let offset = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (offset + value.length > bytes.length) {
        await reader.cancel();
        return null;
      }
      bytes.set(value, offset);
      offset += value.length;
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, offset));
  } catch {
    return null;
  } finally {
    bytes.fill(0);
    reader.releaseLock();
  }
}

export function randomToken(bytes = 32) {
  return crypto.getRandomValues(new Uint8Array(bytes));
}

export function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const encoder = new TextEncoder();
  const [aHash, bHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(aHash, bHash);
}
