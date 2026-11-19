import test from "node:test";
import assert from "node:assert/strict";
import webWorker from "../../web/upstream/worker.mjs";

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

test("preserves static asset errors while applying security headers", async () => {
  const response = await webWorker.fetch(
    new Request("https://eaglevault.eaglenet.asia/missing.js"),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
  );
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("content-security-policy") !== null, true);
});
