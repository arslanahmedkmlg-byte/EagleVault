const encoder = new TextEncoder();

function bytes(hex) {
  return Uint8Array.from(hex.match(/../g), byte => Number.parseInt(byte, 16));
}

function hex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function importPepper(pepper) {
  if (!/^[0-9a-f]{64}$/.test(pepper ?? '')) throw new TypeError('Invalid server pepper');
  return crypto.subtle.importKey('raw', bytes(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function tag(key, purpose, value) {
  const result = await crypto.subtle.sign('HMAC', key, encoder.encode(purpose + '\0' + value));
  return hex(new Uint8Array(result));
}

export function verifyTag(key, purpose, value, expected) {
  return crypto.subtle.verify('HMAC', key, bytes(expected), encoder.encode(purpose + '\0' + value));
}

export async function tokenDigest(token) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(token))));
}

export async function newToken(key, account, type) {
  const prefix = `${type}.${account}.${hex(crypto.getRandomValues(new Uint8Array(32)))}`;
  return prefix + '.' + await tag(key, 'session', prefix);
}
