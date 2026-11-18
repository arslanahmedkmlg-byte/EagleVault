import test from "node:test";
import assert from "node:assert/strict";
import { pbkdf2Sync } from "node:crypto";
import { BitwardenCryptoProvider } from "../../web/src/crypto/bitwarden-crypto.ts";

const crypto = new BitwardenCryptoProvider();
const accountEmail = "User@Example.Test";
const normalizedEmail = "user@example.test";
const syntheticPassword = "EagleVault synthetic test password - not a real credential";
const pbkdf2 = { type: "pbkdf2-sha256", iterations: 5000 };

test("derives a stable 32-byte PBKDF2 master key using normalized email salt", () => {
  const first = crypto.deriveMasterKey(syntheticPassword, accountEmail, pbkdf2);
  const second = crypto.deriveMasterKey(syntheticPassword, normalizedEmail, pbkdf2);
  assert.equal(first.byteLength, 32);
  assert.deepEqual(first, second);
});

test("derives the Bitwarden one-iteration PBKDF2 authentication hash", async () => {
  const masterKey = crypto.deriveMasterKey(syntheticPassword, accountEmail, pbkdf2);
  const actual = await crypto.deriveMasterPasswordAuthenticationHash(syntheticPassword, masterKey);
  const expected = pbkdf2Sync(masterKey.subarray(0, 32), syntheticPassword, 1, 32, "sha256").toString("base64");
  assert.equal(actual, expected);
});

test("creates and unwraps a user key with the Bitwarden SDK", () => {
  const userKey = crypto.generateUserKey();
  assert.equal(userKey.byteLength, 64);
  const wrapped = crypto.encryptUserKeyWithMasterPassword(
    userKey, syntheticPassword, accountEmail, pbkdf2,
  );
  assert.match(wrapped, /^2\./);
  const unwrapped = crypto.decryptUserKeyWithMasterPassword(
    wrapped, syntheticPassword, normalizedEmail, pbkdf2,
  );
  assert.deepEqual(unwrapped, userKey);
});

test("encrypts and decrypts a vault field using Bitwarden AES-256-CBC-HMAC", () => {
  const userKey = crypto.generateUserKey();
  const plaintext = "EagleVault cross-client crypto fixture";
  const encrypted = crypto.encryptString(plaintext, userKey);
  assert.match(encrypted, /^2\./);
  assert.equal(crypto.decryptString(encrypted, userKey), plaintext);
});

test("rejects invalid key sizes before crypto operations", async () => {
  assert.throws(() => crypto.encryptString("secret", new Uint8Array(32)), /64-byte/);
  assert.throws(() => crypto.decryptUserKeyWithMasterPassword("bad", "x", "x@example.test", pbkdf2));
  await assert.rejects(
    crypto.deriveMasterPasswordAuthenticationHash("x", new Uint8Array(64)),
    /exactly 32 bytes/,
  );
});

test("derives an Argon2id master key from server-provided parameters", () => {
  const kdf = { type: "argon2id", iterations: 2, memory: 16, parallelism: 1 };
  const first = crypto.deriveMasterKey(syntheticPassword, accountEmail, kdf);
  const second = crypto.deriveMasterKey(syntheticPassword, accountEmail, kdf);
  assert.equal(first.byteLength, 32);
  assert.deepEqual(first, second);
});

test("rejects invalid KDF parameters even when called outside pre-login parsing", () => {
  assert.throws(
    () => crypto.deriveMasterKey(syntheticPassword, accountEmail, { type: "pbkdf2-sha256", iterations: 1 }),
    /outside the accepted pre-login range/,
  );
  assert.throws(
    () => crypto.deriveMasterKey(syntheticPassword, accountEmail, {
      type: "argon2id", iterations: 1, memory: 8, parallelism: 0,
    }),
    /outside the accepted pre-login range/,
  );
});
