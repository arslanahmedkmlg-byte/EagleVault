import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const indexPath = new URL("../../web/upstream/applications/pass/src/app/index.tsx", import.meta.url);
const workerPath = new URL("../../web/upstream/worker.mjs", import.meta.url);
const appPath = new URL("../../web/upstream/applications/pass/src/app/App.tsx", import.meta.url);

test("EagleVault hostname renders a direct app shell before Proton app modules load", async () => {
  const index = await readFile(indexPath, "utf8");
  assert.match(index, /isEagleVaultMode\(window\.location\.hostname, window\.location\.search\)/);
  assert.match(index, /if \(eagleVaultMode\)/);
  assert.match(index, /root\.render\(\s*<NotificationsProvider>\s*<EagleVaultApp \/>\s*<\/NotificationsProvider>\s*\)/);
  assert.match(index, /import\('\.\/App'\)/);
});

test("the EagleVault browser bootstrap does not import Proton app startup statically", async () => {
  const index = await readFile(indexPath, "utf8");
  assert.doesNotMatch(index, /import\s+\{ App \}\s+from ['"]\.\/App['"]/);
  assert.match(index, /else \{\s*void import\('@proton\/pass\/lib\/file-storage\/fs'\)/);
  const app = await readFile(appPath, "utf8");
  assert.match(app, /authStore = EAGLEVAULT_MODE \? undefined/);
  assert.match(app, /EAGLEVAULT_MODE \? \(\s*<Router/s);
});

test("the static asset CSP permits external app scripts and Cloudflare challenge scripts", async () => {
  const worker = await readFile(workerPath, "utf8");
  assert.match(worker, /script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline'/);
  assert.match(worker, /connect-src 'self'\$\{apiOrigin \? ` \$\{apiOrigin\}` : ''\}/);
});
