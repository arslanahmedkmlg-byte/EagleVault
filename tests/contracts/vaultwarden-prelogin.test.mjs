import test from "node:test";
import assert from "node:assert/strict";
import { fetchVaultwardenPrelogin } from "../../web/src/api/vaultwarden-prelogin.ts";

test("normalizes email and parses PBKDF2 settings", async () => {
  let request;
  const result = await fetchVaultwardenPrelogin("https://vault.example.test", " User@Example.Test ", async (url, init) => {
    request = { url: String(url), init };
    return Response.json({ kdf: 0, kdfIterations: 600000, salt: null });
  });
  assert.equal(request.url, "https://vault.example.test/api/accounts/prelogin");
  assert.deepEqual(JSON.parse(request.init.body), { email: "user@example.test" });
  assert.deepEqual(result, { emailSalt: "user@example.test", kdf: { type: "pbkdf2-sha256", iterations: 600000 } });
});

test("parses Argon2id parameters", async () => {
  const result = await fetchVaultwardenPrelogin("https://vault.example.test", "user@example.test", async () =>
    Response.json({ kdfSettings: { kdfType: 1, iterations: 3, memory: 64, parallelism: 4 } }));
  assert.deepEqual(result.kdf, { type: "argon2id", iterations: 3, memory: 64, parallelism: 4 });
});

test("rejects KDF downgrade parameters", async () => {
  await assert.rejects(
    fetchVaultwardenPrelogin("https://vault.example.test", "user@example.test", async () =>
      Response.json({ kdf: 0, kdfIterations: 1 })),
    /outside the accepted pre-login range/,
  );
});

test("rejects invalid email before network access", async () => {
  await assert.rejects(
    fetchVaultwardenPrelogin("https://vault.example.test", "not-an-email", async () => {
      throw new Error("network must not be called");
    }),
    /valid account email/,
  );
});
