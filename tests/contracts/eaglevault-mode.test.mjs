import test from "node:test";
import assert from "node:assert/strict";
import { isEagleVaultMode } from "../../web/upstream/applications/pass/src/app/EagleVault/mode.ts";

test("the public EagleVault hostname selects EagleVault mode without a query flag", () => {
  assert.equal(isEagleVaultMode("eaglevault.eaglenet.asia", ""), true);
});

test("local preview requires the explicit EagleVault query flag", () => {
  assert.equal(isEagleVaultMode("localhost", "?eaglevault=1"), true);
  assert.equal(isEagleVaultMode("localhost", ""), false);
  assert.equal(isEagleVaultMode("example.com", "?eaglevault=0"), false);
});
