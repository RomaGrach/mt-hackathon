import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../backend/http.js';

async function fixture(t, options = {}) {
  const app = createApp({
    database: ':memory:',
    sweep: false,
    rateLimit: 10000,
    integrationKey: 'test-only-key-not-for-deployment-123456',
    ...options,
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  t.after(async () => {
    await new Promise((resolve) => {
      app.server.close(resolve);
      app.server.closeAllConnections();
    });
  });
  async function request(path, { method = 'GET', body, cookie, headers = {} } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Reis-Client': 'web',
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: response.status, data, headers: response.headers };
  }
  const login = await request('/api/session', { method: 'POST', body: {} });
  return { ...app, base, request, login, cookie: login.headers.get('set-cookie').split(';')[0] };
}
test('HTTP-сессия: HttpOnly/SameSite, профиль с сервера, нет token в JSON', async (t) => {
  const { request, login, cookie } = await fixture(t);
  assert.equal(login.status, 201);
  assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  assert.equal(login.data.token, undefined);
  assert.equal((await request('/api/bootstrap')).status, 401);
  assert.equal(
    (await request('/api/bootstrap', { cookie })).data.profile.id,
    login.data.profile.id
  );
});
test('HTTP полный сценарий, повтор отправки, refresh и отказ от поддельных points', async (t) => {
  const { request, cookie } = await fixture(t);
  const startBody = { scenarioId: 'service', practice: false, requestId: randomUUID() };
  let response = await request('/api/runs', { method: 'POST', cookie, body: startBody });
  assert.equal(response.status, 201);
  let run = response.data;
  assert.deepEqual(
    (await request('/api/runs', { method: 'POST', cookie, body: startBody })).data,
    run
  );
  const fake = await request('/api/runs/' + run.id + '/decision', {
    method: 'POST',
    cookie,
    body: { optionId: 'acknowledge', points: 9999, revision: 0, requestId: randomUUID() },
  });
  assert.equal(fake.status, 400);
  for (const optionId of ['acknowledge', 'check', 'consent', 'feedback']) {
    response = await request('/api/runs/' + run.id + '/decision', {
      method: 'POST',
      cookie,
      body: { optionId, revision: run.revision, requestId: randomUUID() },
    });
    assert.equal(response.status, 200);
    run = response.data;
    assert.equal(run.phase, 'feedback');
    const reloaded = await request('/api/runs/' + run.id, { cookie });
    assert.equal(reloaded.data.revision, run.revision);
    response = await request('/api/runs/' + run.id + '/continue', {
      method: 'POST',
      cookie,
      body: { revision: run.revision, requestId: randomUUID() },
    });
    assert.equal(response.status, 200);
    run = response.data;
  }
  assert.equal(run.result.passed, true);
  assert.equal(
    (await request('/api/leaderboard?scope=company', { cookie })).data.rows[0].score,
    run.points
  );
});
test('защита от CSRF, некорректного JSON, лишних полей и слишком большого тела', async (t) => {
  const { request, cookie } = await fixture(t);
  assert.equal(
    (
      await request('/api/profile', {
        method: 'PATCH',
        cookie,
        body: { crew: 'msk-2' },
        headers: { Origin: 'https://other.example' },
      })
    ).status,
    403
  );
  assert.equal(
    (
      await request('/api/profile', {
        method: 'PATCH',
        cookie,
        body: { crew: 'msk-2' },
        headers: { 'X-Reis-Client': '' },
      })
    ).status,
    403
  );
  assert.equal(
    (await request('/api/profile', { method: 'PATCH', cookie, body: '{bad' })).status,
    400
  );
  assert.equal(
    (await request('/api/profile', { method: 'PATCH', cookie, body: { name: 'real person' } }))
      .status,
    400
  );
  assert.equal(
    (await request('/api/profile', { method: 'PATCH', cookie, body: { crew: 'invented' } })).status,
    400
  );
  assert.equal(
    (await request('/api/profile', { method: 'PATCH', cookie, body: { crew: 'x'.repeat(20000) } }))
      .status,
    413
  );
});
test('static allowlist не раскрывает исходники сервера, БД, git и конфиги', async (t) => {
  const { request } = await fixture(t);
  for (const file of [
    '/backend/catalog.js',
    '/src/scenarios.js',
    '/data/reis400.sqlite',
    '/.git/config',
    '/.env',
    '/package.json',
    '/docs/01-hackathon.md',
    '/%2e%2e/backend/service.js',
    '/%5c..%5c.env',
  ]) {
    assert.equal((await request(file)).status, 404, file);
  }
  assert.equal((await request('/%ZZ')).status, 400);
  const root = await request('/');
  assert.equal(root.status, 200);
  assert.match(root.headers.get('content-security-policy'), /frame-ancestors 'none'/);
});
test('HR API: ключ обязателен, только чтение, курсоры и лимит валидируются', async (t) => {
  const { request, login } = await fixture(t);
  const url = '/api/integrations/v1/profiles';
  assert.equal((await request(url)).status, 401);
  const headers = { Authorization: 'Bearer test-only-key-not-for-deployment-123456' };
  const response = await request(url, { headers });
  assert.equal(response.status, 200);
  assert.equal(response.data.items[0].employeeId, login.data.profile.id);
  assert.equal((await request(url + '?limit=0', { headers })).status, 400);
  assert.equal((await request('/api/integrations/v1/results?cursor=-1', { headers })).status, 400);
  assert.equal((await request(url, { method: 'POST', body: {}, headers })).status, 405);
});
test('интеграция без настроенного ключа выключена, rate-limit предсказуем', async (t) => {
  const { request, cookie } = await fixture(t, { integrationKey: '', rateLimit: 4 });
  assert.equal((await request('/api/integrations/v1/results')).status, 503);
  await request('/api/bootstrap', { cookie });
  await request('/api/bootstrap', { cookie });
  const limited = await request('/api/bootstrap', { cookie });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '60');
});

test('неизвестный scope предсказуемо отклоняется; OpenAPI доступен', async (t) => {
  const { request, cookie } = await fixture(t);
  for (const scope of ['toString', '__proto__', 'unknown'])
    assert.equal((await request('/api/leaderboard?scope=' + scope, { cookie })).status, 400);
  const response = await request('/api/openapi.json');
  assert.equal(response.status, 200);
  const spec = response.data;
  assert.equal(spec.openapi, '3.1.0');
  assert.ok(spec.paths['/api/runs']);
});
