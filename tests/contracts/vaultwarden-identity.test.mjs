import test from "node:test";
import assert from "node:assert/strict";
import { VaultwardenIdentityClient } from "../../web/src/api/vaultwarden-identity-client.ts";
import { loginToVaultwarden } from "../../web/src/auth/vaultwarden-password-login.ts";

test("identity password grant sends form-encoded fields without a bearer token", async () => {
  let captured;
  const client = new VaultwardenIdentityClient("https://vault.example.test", async (url, init) => {
    captured = { url: String(url), init };
    return Response.json({
      access_token: "synthetic-access", refresh_token: "synthetic-refresh",
      expires_in: 3600, token_type: "Bearer",
    });
  });
  const result = await client.passwordGrant({
    username: "User@Example.Test",
    authenticationHash: "derived-authentication-hash",
    clientId: "web",
    deviceIdentifier: "device-fixture",
    deviceName: "EagleVault tests",
    deviceType: "10",
    twoFactorToken: "123456",
    twoFactorProvider:  totpProvider(),
    twoFactorRemember: true,
  });
  assert.equal(captured.url, "https://vault.example.test/identity/connect/token");
  assert.equal(captured.init.headers.Authorization, undefined);
  assert.equal(captured.init.headers["Content-Type"], "application/x-www-form-urlencoded");
  assert.equal(captured.init.headers["Bitwarden-Client-Name"], "web");
  assert.equal(captured.init.headers["Device-Type"], "10");
  assert.equal(captured.init.headers["Device-Identifier"], "device-fixture");
  assert.equal(captured.init.headers["Auth-Email"], "dXNlckBleGFtcGxlLnRlc3Q");
  const form = new URLSearchParams(captured.init.body);
  assert.equal(form.get("grant_type"), "password");
  assert.equal(form.get("username"), "user@example.test");
  assert.equal(form.get("password"), "derived-authentication-hash");
  assert.equal(form.get("two_factor_token"), "123456");
  assert.equal(form.get("two_factor_remember"), "1");
  assert.equal(result.access_token, "synthetic-access");
});

test("refresh grant sends only the refresh token and client id", async () => {
  let captured;
  const client = new VaultwardenIdentityClient("https://vault.example.test", async (_url, init) => {
    captured = init;
    return Response.json({
      access_token: "new-access", refresh_token: "new-refresh",
      expires_in: 3600, token_type: "Bearer",
    });
  });
  await client.refreshGrant("old-refresh", "web");
  const form = new URLSearchParams(captured.body);
  assert.equal(form.get("grant_type"), "refresh_token");
  assert.equal(form.get("refresh_token"), "old-refresh");
  assert.equal(form.get("client_id"), "web");
  assert.equal(form.has("username"), false);
});

test("password login performs prelogin before the identity request and never submits plaintext", async () => {
  const calls = [];
  const result = await loginToVaultwarden({
    serverUrl: "https://vault.example.test",
    email: "User@Example.Test",
    masterPassword: "synthetic password for test only",
    clientId: "web",
    deviceIdentifier: "device-fixture",
    deviceName: "EagleVault tests",
    deviceType: "10",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith("/api/accounts/prelogin")) {
        return Response.json({ kdf: 0, kdfIterations: 5000, salt: null });
      }
      return Response.json({
        access_token: "synthetic-access", refresh_token: "synthetic-refresh",
        expires_in: 3600, token_type: "Bearer",
      });
    },
  });
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /accounts\/prelogin$/);
  assert.match(calls[1].url, /identity\/connect\/token$/);
  const identityForm = new URLSearchParams(calls[1].init.body);
  assert.equal(identityForm.get("grant_type"), "password");
  assert.notEqual(identityForm.get("password"), "synthetic password for test only");
  assert.equal(result.access_token, "synthetic-access");
});

function totpProvider() {
  return 0;
}
