import test from "node:test";
import assert from "node:assert/strict";
import { EagleVaultClient, EagleVaultApiError } from "../../web/src/api/eaglevault-client.ts";

const tokens = (suffix = "one") => ({
  access_token: `ev1.${"a".repeat(64)}.${suffix.padEnd(43, "x")}`,
  refresh_token: `evr1.${"a".repeat(64)}.${suffix.padEnd(43, "y")}`,
  expires_in: 3600,
  token_type: "Bearer",
  Key: "2.wrapped-user-key-fixture",
});

test("register and KDF discovery use Core routes without sending a master password", async () => {
  const requests = [];
  const client = new EagleVaultClient("https://api.eaglevault.eaglenet.asia", async (url, init) => {
    requests.push({ url: String(url), init });
    if (String(url).endsWith("/api/accounts/prelogin")) {
      return Response.json({ kdf: 0, kdfIterations: 600_000 });
    }
    return Response.json({ status: "created" }, { status: 201 });
  });

  const kdf = await client.discoverKdf(" User@Example.Test ");
  await client.register("user@example.test", "derived-hash-only", "2.encrypted-key");

  assert.deepEqual(kdf, {
    emailSalt: "user@example.test",
    kdf: { type: "pbkdf2-sha256", iterations: 600_000 },
  });
  assert.equal(requests[0].url, "https://api.eaglevault.eaglenet.asia/api/accounts/prelogin");
  assert.deepEqual(JSON.parse(requests[0].init.body), { email: "user@example.test" });
  assert.equal(requests[1].url, "https://api.eaglevault.eaglenet.asia/v1/accounts/register");
  assert.equal(requests[1].init.headers.has("Authorization"), false);
  assert.equal(requests[1].init.credentials, "omit");
  assert.equal(JSON.stringify(requests).includes("master password"), false);
});

test("Core vault writes use encrypted record envelopes and refresh on an expired access token", async () => {
  const requests = [];
  let writeAttempt = 0;
  const client = new EagleVaultClient("https://api.eaglevault.eaglenet.asia", async (url, init) => {
    const requestUrl = String(url);
    requests.push({ url: requestUrl, init });
    if (requestUrl.endsWith("/v1/auth/login")) return Response.json(tokens("first"));
    if (requestUrl.endsWith("/v1/auth/refresh")) return Response.json(tokens("rotated"));
    if (requestUrl.endsWith("/v1/vault/records") && writeAttempt++ === 0) {
      return Response.json({ error: "invalid_or_expired_token" }, { status: 401 });
    }
    if (requestUrl.endsWith("/v1/vault/records")) return Response.json({ revision: 1 }, { status: 201 });
    return Response.json({ records: [], cursor: 0, hasMore: false });
  });

  await client.login("user@example.test", "derived-authentication-hash");
  const revision = await client.writeRecord("item", "record-1", 0, "encrypted-ciphertext-only");

  assert.equal(revision, 1);
  assert.equal(requests[1].url, "https://api.eaglevault.eaglenet.asia/v1/vault/records");
  assert.equal(requests[1].init.headers.get("Authorization"), `Bearer ${tokens("first").access_token}`);
  assert.deepEqual(JSON.parse(requests[1].init.body), {
    kind: "item",
    id: "record-1",
    expectedRevision: 0,
    ciphertext: "encrypted-ciphertext-only",
  });
  assert.match(requests[2].url, /\/v1\/auth\/refresh$/);
  assert.equal(requests[3].init.headers.get("Authorization"), `Bearer ${tokens("rotated").access_token}`);
  assert.equal(requests.some(({ init }) => init.redirect !== "error"), false);
});

test("rejects insecure or credential-bearing Core origins", () => {
  assert.throws(() => new EagleVaultClient("http://api.example.test"), /HTTPS origin/);
  assert.throws(() => new EagleVaultClient("https://user:pass@api.example.test"), /HTTPS origin/);
  assert.throws(() => new EagleVaultClient("https://api.example.test/base"), /HTTPS origin/);
});

test("logout revokes the token before clearing in-memory session state", async () => {
  const requests = [];
  const client = new EagleVaultClient("https://api.example.test", async (url, init) => {
    requests.push({ url: String(url), init });
    if (String(url).endsWith("/v1/auth/login")) return Response.json(tokens());
    if (String(url).endsWith("/v1/auth/logout")) return Response.json({ status: "logged_out" });
    return Response.json({ error: "invalid_or_expired_token" }, { status: 401 });
  });
  await client.login("user@example.test", "derived-authentication-hash");
  await client.logout();
  await assert.rejects(client.sync(), (error) => error instanceof EagleVaultApiError && error.status === 401);
  assert.equal(requests[1].url, "https://api.example.test/v1/auth/logout");
  assert.equal(requests[1].init.headers.get("Authorization"), `Bearer ${tokens().access_token}`);
});
