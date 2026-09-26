import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import initSqlJs from 'sql.js/dist/sql-asm.js';
import { SqlJsStore } from '../worker/sqljs-store.js';
import { createApp } from '../backend/http.js';

test('Sites SQL adapter retains a session, ShiftRun, deadline and receipt after reloading its image', async (t) => {
  const SQL = await initSqlJs();
  let image;
  let app;
  let base;
  const open = async () => {
    const store = new SqlJsStore(SQL, image);
    app = createApp({
      store,
      sweep: false,
      publicOrigin: 'https://site.example',
      secureCookie: true,
    });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    base = 'http://127.0.0.1:' + app.server.address().port;
  };
  const close = async () => {
    image = app.store.export();
    await new Promise((resolve) => {
      app.server.close(resolve);
      app.server.closeAllConnections();
    });
    app.store.close();
  };
  t.after(async () => {
    if (app?.server.listening) await close();
  });
  const call = async (path, body, cookie) => {
    const response = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Origin: 'https://site.example',
        'X-Reis-Client': 'web',
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      body: await response.json(),
      cookie: response.headers.get('set-cookie'),
    };
  };
  await open();
  const session = await call('/api/session', {});
  assert.equal(session.status, 201);
  assert.match(session.cookie, /SameSite=Strict/);
  const cookie = session.cookie.split(';')[0];
  const start = {
    requestId: randomUUID(),
    scenarioId: 'text-shift-demo',
    mode: 'training',
    timingPolicyId: 'standard',
  };
  const run = await call('/api/v2/runs', start, cookie);
  assert.equal(run.status, 201);
  const begun = await call(
    '/api/v2/runs/' + run.body.id + '/commands',
    { requestId: randomUUID(), revision: run.body.revision, command: { type: 'begin' } },
    cookie
  );
  assert.equal(begun.status, 200);
  const deadline = begun.body.run.deadline;
  await close();
  assert.ok(image.length > 100_000);
  await open();
  const restored = await call('/api/v2/runs/' + run.body.id, undefined, cookie);
  assert.equal(restored.status, 200);
  assert.equal(restored.body.deadline, deadline);
  const repeat = await call('/api/v2/runs', start, cookie);
  assert.equal(repeat.status, 201);
  assert.deepEqual(repeat.body, run.body);
});
