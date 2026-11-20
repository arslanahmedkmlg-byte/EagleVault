const defaultOrigins = new Set(['https://eaglevault.eaglenet.asia']);
const methods = new Set(['GET', 'POST', 'PUT', 'DELETE']);
const productionHeaders = new Set(['authorization', 'content-type']);
const stagingHeaders = new Set(['authorization', 'content-type', 'x-eaglevault-staging-key']);

function allowedHeaders(env) {
  return env?.STAGING_MODE === 'true' ? stagingHeaders : productionHeaders;
}

function allowedOrigins(env) {
  const configured = env?.CORS_ORIGINS;
  return typeof configured === 'string'
    ? new Set(configured.split(',').map(origin => origin.trim()).filter(Boolean))
    : defaultOrigins;
}

function vary(headers, value) {
  const current = headers.get('vary');
  const values = new Set((current ? current.split(',') : []).map(item => item.trim().toLowerCase()));
  values.add(value.toLowerCase());
  headers.set('vary', [...values].join(', '));
}

function withSecurityHeaders(response, request, env) {
  const responseHeaders = new Headers(response.headers);
  responseHeaders.set('cache-control', 'no-store');
  responseHeaders.set('x-content-type-options', 'nosniff');
  responseHeaders.set('referrer-policy', 'no-referrer');
  responseHeaders.set('strict-transport-security', 'max-age=31536000');

  const origin = request.headers.get('origin');
  if (origin === null) {
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  }

  vary(responseHeaders, 'Origin');
  if (!allowedOrigins(env).has(origin)) {
    return Response.json({ error: 'origin_not_allowed' }, {
      status: 403,
      headers: responseHeaders,
    });
  }

  responseHeaders.set('access-control-allow-origin', origin);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

function preflight(request, env) {
  const origin = request.headers.get('origin');
  const requestedMethod = request.headers.get('access-control-request-method')?.toUpperCase();
  const requestedHeaders = (request.headers.get('access-control-request-headers') ?? '')
    .split(',')
    .map(header => header.trim().toLowerCase())
    .filter(Boolean);

  const responseHeaders = new Headers({
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'strict-transport-security': 'max-age=31536000',
  });
  vary(responseHeaders, 'Origin');
  vary(responseHeaders, 'Access-Control-Request-Method');
  vary(responseHeaders, 'Access-Control-Request-Headers');

  if (origin === null || !allowedOrigins(env).has(origin) ||
      !requestedMethod || !methods.has(requestedMethod) ||
      requestedHeaders.some(header => !allowedHeaders(env).has(header))) {
    return Response.json({ error: 'cors_preflight_rejected' }, {
      status: 403,
      headers: responseHeaders,
    });
  }

  responseHeaders.set('access-control-allow-origin', origin);
  responseHeaders.set('access-control-allow-methods', [...methods].join(', '));
  responseHeaders.set('access-control-allow-headers', [...allowedHeaders(env)].join(', '));
  responseHeaders.set('access-control-max-age', '600');
  return new Response(null, { status: 204, headers: responseHeaders });
}

export function corsResponse(request, env, response) {
  if (request.method === 'OPTIONS') return preflight(request, env);
  return withSecurityHeaders(response, request, env);
}
