export function json(value, status = 200) {
  return Response.json(value, {
    status,
    headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  });
}

export async function readJson(request, maxBodyBytes) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json' ||
      !request.body) throw new TypeError('Invalid content type');
  const reader = request.body.getReader();
  const buffer = new Uint8Array(maxBodyBytes);
  let offset = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (offset + value.byteLength > maxBodyBytes) {
        await reader.cancel();
        throw new RangeError('Request too large');
      }
      buffer.set(value, offset);
      offset += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, offset)));
}

function integer(params, key, fallback) {
  const value = params.get(key);
  if (value === null) return fallback;
  if (!/^\d+$/.test(value) || params.getAll(key).length !== 1) throw new TypeError('Invalid query');
  return Number(value);
}

// Authentication and account-store resolution belong to the runtime adapter.
export function createVaultHandler({ authenticate, storeForAccount }) {
  return async function handleVault(request) {
    const url = new URL(request.url);
    const isSync = url.pathname === '/v1/vault/sync' && request.method === 'GET';
    const match = /^\/v1\/vault\/records\/([0-9a-f-]{36})$/.exec(url.pathname);
    const isWrite = match && request.method === 'PUT';
    if (!isSync && !isWrite) return json({ error: 'not_found' }, 404);
    if (url.protocol !== 'https:') return json({ error: 'https_required' }, 400);

    try {
      const account = await authenticate(request);
      if (!account) return json({ error: 'unauthorized' }, 401);
      const store = storeForAccount(account);
      if (isSync) {
        const after = integer(url.searchParams, 'after', 0);
        const limit = integer(url.searchParams, 'limit', 25);
        return json(await store.syncRecords({ after, limit }));
      }

      const body = await readJson(request, 96 * 1024);
      if (!body || typeof body !== 'object' || Array.isArray(body) ||
          Object.keys(body).length !== 2 || !Object.hasOwn(body, 'ciphertext') ||
          !Object.hasOwn(body, 'expectedRevision')) throw new TypeError('Invalid mutation');
      const result = await store.writeRecord({ ...body, id: match[1] });
      return json(result, result.status === 'conflict' ? 409 : 200);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function errorResponse(error) {
  if (error instanceof TypeError || error instanceof SyntaxError) return json({ error: 'invalid_request' }, 400);
  if (error instanceof RangeError && error.message === 'Request too large') return json({ error: 'request_too_large' }, 413);
  return json({ error: 'internal_error' }, 500);
}
