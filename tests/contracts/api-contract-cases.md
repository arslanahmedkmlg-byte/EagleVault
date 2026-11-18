# API contract test cases

Run against a disposable Vaultwarden instance and synthetic test account only.

## Transport
- Reject non-HTTPS server URLs except localhost test origins.
- Include current bearer token on each authenticated request.
- Never persist or log bearer tokens.
- Reject redirects to avoid forwarding credentials to another origin.
- Preserve non-2xx status and response body in a typed API error.

## Sync and ciphers
- GET /api/sync returns a parseable JSON object.
- POST /api/ciphers sends a Bitwarden-compatible encrypted CipherData payload.
- PUT /api/ciphers/{id} updates the same synthetic cipher.
- DELETE /api/ciphers/{id} removes/trashes it according to server behavior.
- Verify sync returns ciphertext and fixture plaintext is absent from server-side database rows.

## Folders
- GET /api/folders returns the list envelope.
- POST /api/folders creates an encrypted folder name.
- PUT /api/folders/{id} renames it.
- DELETE /api/folders/{id} deletes it.

## Required negative tests
- Expired/invalid bearer token.
- Server unavailable and TLS failure.
- Invalid JSON response.
- 4xx validation response and 5xx server response.
- Cipher revision conflict / stale lastKnownRevisionDate.
- Wrong account attempting to access another account's item.

No test may use production credentials or production vault data.
