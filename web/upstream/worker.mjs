const baseContentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "font-src 'self' data:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob:",
  "object-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self' blob:",
];

async function matchesSecret(supplied, expected) {
  const encoder = new TextEncoder();
  const [suppliedDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(supplied)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const suppliedBytes = new Uint8Array(suppliedDigest);
  const expectedBytes = new Uint8Array(expectedDigest);
  let difference = 0;
  for (let index = 0; index < expectedBytes.length; index++) {
    difference |= suppliedBytes[index] ^ expectedBytes[index];
  }
  return difference === 0;
}

function stagingPassword(request) {
  const authorization = request.headers.get('authorization') ?? '';
  if (!authorization.startsWith('Basic ')) return null;
  try {
    const decoded = atob(authorization.slice(6));
    const separator = decoded.indexOf(':');
    if (separator < 0 || decoded.slice(0, separator) !== 'staging') return null;
    return decoded.slice(separator + 1);
  } catch {
    return null;
  }
}

function securityHeaders(headers, apiOrigin) {
  headers.set('content-security-policy', [
    ...baseContentSecurityPolicy,
    `connect-src 'self'${apiOrigin ? ` ${apiOrigin}` : ''}`,
  ].join('; '));
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('referrer-policy', 'no-referrer');
  headers.set('strict-transport-security', 'max-age=31536000');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-frame-options', 'DENY');
}

export default {
  async fetch(request, env) {
    const staging = env.STAGING_MODE === 'true';
    const stageKey = env.STAGING_ACCESS_KEY;
    const configuredApiOrigin = env.CORE_API_ORIGIN ?? (staging ? '' : 'https://api.eaglevault.eaglenet.asia');
    let apiOrigin = '';
    let stagingApiOriginValid = false;
    try {
      const parsed = new URL(configuredApiOrigin);
      if (parsed.protocol === 'https:' && parsed.origin === configuredApiOrigin) {
        apiOrigin = parsed.origin;
        stagingApiOriginValid = parsed.hostname.startsWith('eaglevault-core-staging.') &&
            parsed.hostname.endsWith('.workers.dev');
      }
    } catch {}

    if (staging && (typeof stageKey !== 'string' || stageKey.length < 43 || !stagingApiOriginValid)) {
      const headers = new Headers({ 'cache-control': 'no-store' });
      securityHeaders(headers, apiOrigin);
      return new Response('Staging access is not configured.', { status: 503, headers });
    }
    if (staging && !await matchesSecret(stagingPassword(request) ?? '', stageKey)) {
      const headers = new Headers({
        'cache-control': 'no-store',
        'www-authenticate': 'Basic realm="EagleVault staging", charset="UTF-8"',
      });
      securityHeaders(headers, apiOrigin);
      return new Response('Staging access required.', {
        status: 401,
        headers,
      });
    }
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    securityHeaders(headers, apiOrigin);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
