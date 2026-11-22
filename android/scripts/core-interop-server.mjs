import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:https';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { EagleVaultSession } from '../../web/src/auth/eaglevault-session.ts';

const [modulePath, workerPath, directory] = process.argv.slice(2);
const { Miniflare, convertV4MiniflareOptions } = await import(pathToFileURL(modulePath));
const origin = 'https://core.example.test';
const email = 'interop@example.test';
const password = 'Synthetic cross-client password';
const invite = 'synthetic-interop-invite';
const runtime = new Miniflare(convertV4MiniflareOptions({
  modules: [{ type: 'ESModule', path: workerPath }],
  modulesRoot: dirname(workerPath),
  compatibilityDate: '2026-11-01',
  durableObjects: { VAULTS: { className: 'VaultStore', useSQLite: true } },
  bindings: {
    SYNTHETIC_STAGING: 'enabled',
    STAGING_PEPPER: '9a'.repeat(32),
    STAGING_REGISTRATION_CODE: invite,
  },
}));
const web = new EagleVaultSession(origin, (url, init) => runtime.dispatchFetch(url, init));
await web.unlock(email, password, invite);
await web.save({
  kind: 'login', name: 'From Web', username: 'fixture', password: 'Web fixture secret',
  url: 'https://example.test', notes: '', folderId: '',
});

const server = createServer({
  key: readFileSync(directory + '/key.pem'),
  cert: readFileSync(directory + '/cert.pem'),
}, async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/verify-android-fixture') {
      const items = await web.sync();
      assert.equal(items.length, 2);
      assert.equal(items.find(item => item.name === 'Edited by Android')?.password, 'Web fixture secret');
      assert.equal(items.find(item => item.name === 'From Android')?.notes, 'Android fixture secret');
      const androidAccount = new EagleVaultSession(origin, (url, init) => runtime.dispatchFetch(url, init));
      await androidAccount.unlock('android-registration@example.test', 'Synthetic Android registration password');
      assert.equal((await androidAccount.sync())[0]?.notes, 'Registration fixture');
      await androidAccount.lock();
      response.end('Android and Web decrypted each other’s records.');
      return;
    }
    const result = await runtime.dispatchFetch(origin + request.url, {
      method: request.method,
      headers: request.headers,
      ...(request.method === 'POST' || request.method === 'PUT' ? { body: request, duplex: 'half' } : {}),
    });
    response.writeHead(result.status, Object.fromEntries(result.headers));
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch (error) {
    console.error(error);
    response.writeHead(500).end('Synthetic interoperability check failed.');
  }
});
server.listen(18443, '127.0.0.1', () => writeFileSync(directory + '/ready', 'ready'));
