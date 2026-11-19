const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "connect-src 'self' https://api.eaglevault.eaglenet.asia",
  "font-src 'self' data:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob:",
  "object-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self' blob:",
].join('; ');

export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set('content-security-policy', contentSecurityPolicy);
    headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
    headers.set('referrer-policy', 'no-referrer');
    headers.set('strict-transport-security', 'max-age=31536000');
    headers.set('x-content-type-options', 'nosniff');
    headers.set('x-frame-options', 'DENY');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
