import test from 'node:test';
import assert from 'node:assert/strict';
import {
  enablePasskeyUnlock, existingPasskeyUnlock, unlockWithPasskey,
  updateProtectedSession, removePasskeyUnlock,
} from '../../web/src/auth/eaglevault-passkey.ts';

test('device passkey encrypts local unlock key and rotates protected token', async () => {
  const oldWindow = globalThis.window;
  const oldLocation = globalThis.location;
  const oldPublicKeyCredential = globalThis.PublicKeyCredential;
  const oldNavigator = globalThis.navigator;
  const oldStorage = globalThis.localStorage;
  const storage = new Map();
  const fakeStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  };
  const credentialId = crypto.getRandomValues(new Uint8Array(32));
  const prfSecret = crypto.getRandomValues(new Uint8Array(32));
  let verified = 0;
  class FakePublicKeyCredential {
    constructor() {
      this.rawId = credentialId.buffer;
      const flags = new Uint8Array(37);
      flags[32] = 5; // User present and user verified.
      this.response = { authenticatorData: flags.buffer };
    }
    getClientExtensionResults() {
      return { prf: { results: { first: prfSecret.slice().buffer } } };
    }
  }
  const fakeNavigator = {
    credentials: {
      async create({ publicKey }) {
        assert.equal(publicKey.authenticatorSelection.userVerification, 'required');
        assert.equal(publicKey.authenticatorSelection.authenticatorAttachment, 'platform');
        return new FakePublicKeyCredential();
      },
      async get({ publicKey }) {
        assert.equal(publicKey.userVerification, 'required');
        assert.equal(publicKey.allowCredentials.length, 1);
        verified++;
        return new FakePublicKeyCredential();
      },
    },
  };
  const define = (name, value) => Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  define('window', globalThis);
  define('location', { origin: 'https://eaglevault.eaglenet.asia', hostname: 'eaglevault.eaglenet.asia' });
  define('PublicKeyCredential', FakePublicKeyCredential);
  define('navigator', fakeNavigator);
  define('localStorage', fakeStorage);
  globalThis.isSecureContext = true;
  const key = crypto.getRandomValues(new Uint8Array(64));
  const token1 = 'evr1.' + 'a'.repeat(64) + '.' + 'x'.repeat(43);
  const token2 = 'evr1.' + 'a'.repeat(64) + '.' + 'y'.repeat(43);
  let unlock;
  let created;
  try {
    created = await enablePasskeyUnlock('TEST@EXAMPLE.TEST', key, token1);
    assert.equal(created.record.email, 'test@example.test');
    assert.equal(verified, 1);
    const ciphertext = JSON.stringify([...storage.values()]);
    assert.equal(ciphertext.includes(token1), false);
    assert.equal(ciphertext.includes(Buffer.from(key).toString('base64')), false);
    unlock = await unlockWithPasskey();
    assert.deepEqual(unlock.userKey, key);
    assert.equal(unlock.refreshToken, token1);
    await updateProtectedSession(unlock, token2);
    assert.equal(JSON.stringify([...storage.values()]).includes(token2), false);
    const unlockedAgain = await unlockWithPasskey();
    assert.equal(unlockedAgain.refreshToken, token2);
    unlockedAgain.userKey.fill(0);
    removePasskeyUnlock();
    assert.equal(existingPasskeyUnlock(), null);
    await assert.rejects(unlockWithPasskey(), /not configured/);
  } finally {
    key.fill(0);
    unlock?.userKey.fill(0);
    created?.userKey.fill(0);
    for (const [name, original] of [
      ['window', oldWindow], ['location', oldLocation], ['PublicKeyCredential', oldPublicKeyCredential],
      ['navigator', oldNavigator], ['localStorage', oldStorage],
    ]) {
      if (original === undefined) delete globalThis[name];
      else define(name, original);
    }
    delete globalThis.isSecureContext;
  }
});

test('refresh tokens are rejected if malformed before network access', async () => {
  const { EagleVaultClient } = await import('../../web/src/api/eaglevault-client.ts');
  const client = new EagleVaultClient('https://api.example.test', async () => {
    throw new Error('unexpected network request');
  });
  await assert.rejects(client.resumeWithRefreshToken('invalid'), /Invalid protected session/);
});
