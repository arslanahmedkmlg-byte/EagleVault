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

test("production forwards Core API paths through a same-origin proxy without cookies", async () => {
  const originalFetch = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (request) => {
    sent.push({
      url: request.url,
      method: request.method,
      contentType: request.headers.get("content-type"),
      cookie: request.headers.get("cookie"),
      body: await request.text(),
      redirect: request.redirect,
    });
    return Response.json({ kdf: 0, kdfIterations: 600000 });
  };
  let assetReads = 0;
  try {
    const response = await webWorker.fetch(new Request(
      "https://eaglevault.eaglenet.asia/api/accounts/prelogin?test=1", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: "secret-cookie" },
        body: JSON.stringify({ email: "synthetic@example.test" }),
      }),
      { ASSETS: { fetch: async () => { assetReads++; return new Response("static"); } } },
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(assetReads, 0);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].url, "https://api.eaglevault.eaglenet.asia/api/accounts/prelogin?test=1");
    assert.equal(sent[0].method, "POST");
    assert.equal(sent[0].cookie, null);
    assert.equal(sent[0].redirect, "manual");
    assert.match(sent[0].body, /synthetic@example.test/);
    assert.equal((await response.json()).kdfIterations, 600000);

    const unknown = await webWorker.fetch(new Request("https://eaglevault.eaglenet.asia/not-an-api-path"), {
      ASSETS: { fetch: async () => { assetReads++; return new Response("static"); } },
    });
    assert.equal(await unknown.text(), "static");
    assert.equal(assetReads, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("staging never invokes the production same-origin Core proxy", async () => {
  let reads = 0;
  const response = await webWorker.fetch(
    new Request("https://eaglevault-web-staging.example.workers.dev/v1/auth/login", {
      headers: { authorization: basicAuthorization },
    }),
    {
      STAGING_MODE: "true",
      STAGING_ACCESS_KEY: stagingKey,
      CORE_API_ORIGIN: "https://eaglevault-core-staging.example.workers.dev",
      ASSETS: { fetch: async () => { reads++; return new Response("staging asset"); } },
    },
  );
  assert.equal(await response.text(), "staging asset");
  assert.equal(reads, 1);
});
