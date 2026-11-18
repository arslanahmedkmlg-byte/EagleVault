import test from "node:test";
import assert from "node:assert/strict";
import { VaultwardenClient, VaultwardenApiError } from "../../web/src/api/vaultwarden-client.ts";

function makeClient(responder) {
  const requests = [];
  const client = new VaultwardenClient({
    serverUrl: "https://vault.example.test",
    accessToken: async () => "synthetic-test-token",
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), init });
      return responder(url, init);
    },
  });
  return { client, requests };
}

test("rejects insecure non-local server URL", () => {
  assert.throws(
    () => new VaultwardenClient({ serverUrl: "http://vault.example.test", accessToken: async () => "x" }),
    /must use HTTPS/,
  );
});

test("sync uses API prefix, bearer auth and refuses redirects", async () => {
  const { client, requests } = makeClient(async () => new Response(JSON.stringify({ ciphers: [] }), {
    status: 200, headers: { "content-type": "application/json" },
  }));
  const result = await client.sync();
  assert.deepEqual(result, { ciphers: [] });
  assert.equal(requests[0].url, "https://vault.example.test/api/sync");
  assert.equal(requests[0].init.headers.get("Authorization"), "Bearer synthetic-test-token");
  assert.equal(requests[0].init.redirect, "error");
  assert.equal(requests[0].init.credentials, "omit");
});

test("cipher create posts JSON to the audited endpoint", async () => {
  const payload = { type: 1, data: "ciphertext-only" };
  const { client, requests } = makeClient(async (_url, init) => new Response(init.body, { status: 200 }));
  const result = await client.createCipher(payload);
  assert.deepEqual(result, payload);
  assert.equal(requests[0].url, "https://vault.example.test/api/ciphers");
  assert.equal(requests[0].init.method, "POST");
  assert.equal(requests[0].init.headers.get("Content-Type"), "application/json");
});

test("non-2xx response becomes a typed error", async () => {
  const { client } = makeClient(async () => new Response("invalid token", { status: 401 }));
  await assert.rejects(client.sync(), (error) => {
    assert.ok(error instanceof VaultwardenApiError);
    assert.equal(error.status, 401);
    assert.equal(error.responseBody, "invalid token");
    return true;
  });
});

test("delete returns void and targets an encoded cipher id", async () => {
  const { client, requests } = makeClient(async () => new Response(null, { status: 204 }));
  await client.deleteCipher("id/with slash");
  assert.equal(requests[0].url, "https://vault.example.test/api/ciphers/id%2Fwith%20slash");
});
