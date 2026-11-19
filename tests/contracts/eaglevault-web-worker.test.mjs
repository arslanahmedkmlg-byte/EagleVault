import test from "node:test";
import assert from "node:assert/strict";
import webWorker from "../../web/upstream/worker.mjs";

const stagingKey = "S".repeat(43);
const basicAuthorization = `Basic ${btoa(`staging:${stagingKey}`)}`;

test("serves static app responses with a restrictive EagleVault security policy", async () => {
  const response = await webWorker.fetch(
    new Request("https://eaglevault.eaglenet.asia/app/"),
    { ASSETS: { fetch: async () => new Response("<html>app</html>", {
      headers: { "content-type": "text/html" },
    }) } },
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-security-policy"), /connect-src 'self' https:\/\/api\.eaglevault\.eaglenet\.asia/);
  assert.match(response.headers.get("content-security-policy"), /object-src 'none'/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(await response.text(), "<html>app</html>");
});

test("staging assets require Basic authentication and fail closed without a secret", async () => {
  let assetReads = 0;
  const env = {
    STAGING_MODE: "true",
    STAGING_ACCESS_KEY: stagingKey,
    CORE_API_ORIGIN: "https://eaglevault-core-staging.example.workers.dev",
    ASSETS: { fetch: async () => {
      assetReads++;
      return new Response("<html>staging</html>");
    } },
  };
  const unauthorized = await webWorker.fetch(
    new Request("https://eaglevault-web-staging.example.workers.dev/"),
    env,
  );
  assert.equal(unauthorized.status, 401);
  assert.match(unauthorized.headers.get("www-authenticate"), /Basic/);
  assert.match(unauthorized.headers.get("content-security-policy"), /eaglevault-core-staging/);
  assert.notEqual(unauthorized.headers.get("strict-transport-security"), null);
  assert.equal(assetReads, 0);

  const misconfigured = await webWorker.fetch(
    new Request("https://eaglevault-web-staging.example.workers.dev/"),
    { ...env, STAGING_ACCESS_KEY: undefined },
  );
  assert.equal(misconfigured.status, 503);
  assert.notEqual(misconfigured.headers.get("content-security-policy"), null);
  assert.equal(assetReads, 0);

  const missingApiOrigin = await webWorker.fetch(
    new Request("https://eaglevault-web-staging.example.workers.dev/"),
    { ...env, CORE_API_ORIGIN: undefined },
  );
  assert.equal(missingApiOrigin.status, 503);
  assert.equal(assetReads, 0);

  const authorized = await webWorker.fetch(
    new Request("https://eaglevault-web-staging.example.workers.dev/", {
      headers: { authorization: basicAuthorization },
    }),
    env,
  );
  assert.equal(authorized.status, 200);
  assert.equal(await authorized.text(), "<html>staging</html>");
  assert.equal(assetReads, 1);
});

test("preserves static asset errors while applying security headers", async () => {
  const response = await webWorker.fetch(
    new Request("https://eaglevault.eaglenet.asia/missing.js"),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
  );
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("content-security-policy") !== null, true);
});
