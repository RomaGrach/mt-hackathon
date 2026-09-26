import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createApp } from '../backend/http.js';

const secret = 'local-test-secret-0123456789-abcdef';

test('production backend accepts only requests signed by the Sites proxy', async (t) => {
  const app = createApp({ database: ':memory:', sweep: false, proxySecret: secret });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        app.server.close(resolve);
        app.server.closeAllConnections();
      })
  );
  const health = 'http://127.0.0.1:' + app.server.address().port + '/api/health';
  assert.equal((await fetch(health)).status, 401);
  const response = await fetch(health, { headers: { 'X-Reis-Proxy-Secret': secret } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'ok');
});

test('Sites proxy keeps same-origin session and CSRF headers while hiding its secret', async () => {
  const source = (
    await readFile(new URL('../worker/sites-proxy.js', import.meta.url), 'utf8')
  ).replace('__STATIC_ASSETS__', JSON.stringify({ '/': '<main>РЕЙС 400</main>' }));
  const { default: worker } = await import(
    'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
  );
  assert.equal((await worker.fetch(new Request('https://site.example/'), {})).status, 200);
  assert.equal((await worker.fetch(new Request('https://site.example/.env'), {})).status, 404);
  assert.equal(
    (await worker.fetch(new Request('https://site.example/api/health'), {})).status,
    503
  );

  const originalFetch = globalThis.fetch;
  let forwarded;
  globalThis.fetch = async (url, init) => {
    forwarded = { url: String(url), init };
    return new Response('{}', {
      status: 201,
      headers: { 'set-cookie': 'reis_session=abc; Path=/; HttpOnly; Secure; SameSite=Strict' },
    });
  };
  try {
    const response = await worker.fetch(
      new Request('https://site.example/api/v2/runs?demo=1', {
        method: 'POST',
        headers: {
          Origin: 'https://site.example',
          Cookie: 'reis_session=abc',
          'X-Reis-Client': 'web',
          'X-Reis-Proxy-Secret': 'attacker-supplied',
        },
        body: '{}',
      }),
      { API_UPSTREAM_ORIGIN: 'https://api.example', PROXY_SHARED_SECRET: secret }
    );
    assert.equal(response.status, 201);
    assert.equal(forwarded.url, 'https://api.example/api/v2/runs?demo=1');
    assert.equal(forwarded.init.headers.get('origin'), 'https://site.example');
    assert.equal(forwarded.init.headers.get('cookie'), 'reis_session=abc');
    assert.equal(forwarded.init.headers.get('x-reis-client'), 'web');
    assert.equal(forwarded.init.headers.get('x-reis-proxy-secret'), secret);
    assert.match(response.headers.get('set-cookie'), /SameSite=Strict/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
