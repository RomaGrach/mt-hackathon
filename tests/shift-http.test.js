import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../backend/http.js';
import { commandFor } from '../src/shift-view.js';
async function setup(t) {
  let now = Date.parse('2026-09-26T10:00:00Z');
  const app = createApp({
    database: ':memory:',
    clock: () => now,
    sweep: false,
    rateLimit: 10000,
    sessionLimit: 1000,
    integrationKey: 'test-only-key-not-for-deployment-123456',
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  t.after(
    () =>
      new Promise((resolve) => {
        app.server.close(resolve);
        app.server.closeAllConnections();
      })
  );
  const h = {
    ...app,
    base,
    now(value) {
      now = value;
    },
    cookie: null,
    run: null,
  };
  h.request = async (path, body, method = body === undefined ? 'GET' : 'POST', headers = {}) => {
    const r = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Reis-Client': 'web',
        ...(h.cookie ? { Cookie: h.cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: r.status, data, headers: r.headers };
  };
  const session = await h.request('/api/session', {});
  h.cookie = session.headers.get('set-cookie').split(';')[0];
  h.profile = session.data.profile.id;
  h.start = async () => {
    const r = await h.request('/api/v2/runs', {
      requestId: randomUUID(),
      scenarioId: 'text-shift-demo',
      mode: 'training',
      timingPolicyId: 'standard',
    });
    assert.equal(r.status, 201);
    return (h.run = r.data);
  };
  h.act = async (type, id) => {
    const a = h.run.actions.find(
      (a) => a.command === type && (!id || a.actionId === id || a.incidentId === id)
    );
    assert.ok(a);
    const r = await h.request('/api/v2/runs/' + h.run.id + '/commands', {
      requestId: randomUUID(),
      revision: h.run.revision,
      command: commandFor(a),
    });
    assert.equal(r.status, 200, JSON.stringify(r));
    return (h.run = r.data.run);
  };
  h.work = async (id) => {
    if (h.run.phase === 'feedback') await h.act('continue');
    if (h.run.phase === 'overview') await h.act('focus', 'a-seat');
    return h.act('choose', id);
  };
  return h;
}

test('HTTP v2: полный путь, серверный timeout при 409, exact receipt, результат/ack/экспорт', async (t) => {
  const h = await setup(t);
  await h.start();
  await h.act('begin');
  await h.act('choose', 'inspect-predeparture');
  await h.work('acknowledge-and-promise');
  await h.work('verify-and-request');
  await h.act('continue');
  await h.act('wait');
  await h.act('continue');
  const r = h.run,
    id = r.id,
    body = {
      requestId: randomUUID(),
      revision: r.revision,
      command: commandFor(r.actions.find((a) => a.actionId === 'clear-aisle')),
    };
  h.now(r.criticalWindow.deadline);
  const timeout = await h.request('/api/v2/runs/' + id + '/commands', body);
  assert.equal(timeout.status, 409);
  assert.equal(timeout.data.error.code, 'DEADLINE_EXPIRED');
  assert.equal(timeout.data.run.feedback.timedOut, true);
  assert.deepEqual((await h.request('/api/v2/runs/' + id + '/commands', body)).data, timeout.data);
  h.run = (await h.request('/api/v2/runs/' + id)).data;
  await h.work('confirm-and-return-p1');
  await h.act('continue');
  await h.act('finish');
  const result = (await h.request('/api/v2/runs/' + id + '/result')).data;
  assert.equal(result.passed, false);
  assert.equal(result.scales.safety, 40);
  assert.equal(result.episodePoints, 50);
  const ackBody = { requestId: randomUUID() },
    ack = await h.request('/api/v2/results/' + id + '/debrief-ack', ackBody);
  assert.equal(ack.data.deltaXP, 20);
  assert.deepEqual(
    (await h.request('/api/v2/results/' + id + '/debrief-ack', ackBody)).data,
    ack.data
  );
  const exact = await h.request('/api/v2/runs/' + id + '/replay');
  assert.equal(exact.data.verified, true);
  assert.equal(exact.data.rewardsIssued, false);
  const exported = (await h.request('/api/profile/export')).data;
  assert.equal(exported.notForEmploymentDecisions, true);
  assert.equal(exported.motivationV2.lifetimePracticeXP, 20);
  assert.equal(JSON.stringify(exported).includes('reis_session'), false);
});

test('HTTP v2: неизвестные поля/поддельные часы/ключи отклоняются; отклонённый command receipt резервируется', async (t) => {
  const h = await setup(t);
  await h.start();
  const path = '/api/v2/runs/' + h.run.id + '/commands';
  const bad = { requestId: randomUUID(), revision: 0, command: { type: 'begin' }, points: 99999 };
  const first = await h.request(path, bad);
  assert.equal(first.status, 400);
  assert.deepEqual((await h.request(path, bad)).data, first.data);
  const corrected = { requestId: bad.requestId, revision: 0, command: { type: 'begin' } };
  assert.equal((await h.request(path, corrected)).data.error.code, 'KEY_REUSED');
  for (const command of [
    { type: '_timeout' },
    { type: 'begin', acceptedAt: 0 },
    { type: 'begin', scales: { safety: 100 } },
    { type: 'choose', actionId: 'hidden-answer' },
  ]) {
    const r = await h.request(path, { requestId: randomUUID(), revision: 0, command });
    assert.equal(r.status, 400);
  }
  assert.equal((await h.request('/api/v2/runs/' + h.run.id)).data.revision, 0);
  assert.equal(
    (
      await h.request(
        path,
        { requestId: randomUUID(), revision: 0, command: { type: 'begin' } },
        'POST',
        { Origin: 'https://not-this-game.example' }
      )
    ).status,
    403
  );
  assert.equal(
    (
      await h.request(
        path,
        { requestId: randomUUID(), revision: 0, command: { type: 'begin' } },
        'POST',
        { 'X-Reis-Client': '' }
      )
    ).status,
    403
  );
});

test('HTTP v2: owner scope, закрытый internal content, недопустимые параметры рейтинга', async (t) => {
  const h = await setup(t);
  await h.start();
  const id = h.run.id,
    oldCookie = h.cookie;
  h.cookie = null;
  assert.equal((await h.request('/api/v2/runs/' + id)).status, 401);
  const other = await h.request('/api/session', {});
  h.cookie = other.headers.get('set-cookie').split(';')[0];
  assert.equal((await h.request('/api/v2/runs/' + id)).status, 404);
  assert.equal(
    (await h.request('/api/v2/results/' + id + '/debrief-ack', { requestId: randomUUID() })).status,
    404
  );
  h.cookie = oldCookie;
  for (const path of [
    '/backend/shift-content.js',
    '/backend/shift-engine.js',
    '/data/reis400.sqlite',
    '/api/v2/admin',
  ])
    assert.equal((await h.request(path)).status, 404);
  for (const query of ['scope=global', 'limit=51', 'limit=0', 'offset=-1'])
    assert.equal((await h.request('/api/v2/leaderboards?' + query)).status, 400);
  const catalog = (await h.request('/api/v2/catalog')).data;
  assert.equal(catalog.items[0].classes.length, 4);
  assert.equal(JSON.stringify(catalog).includes('safeActions'), false);
});

test('HTTP v2: API-контракт содержит endpoints, tagged commands, метрики и read-only integration', async (t) => {
  const h = await setup(t);
  const spec = (await h.request('/api/openapi.json')).data;
  for (const path of [
    '/api/v2/runs',
    '/api/v2/runs/{id}/commands',
    '/api/v2/results/{id}/debrief-ack',
    '/api/v2/motivation',
    '/api/v2/leaderboards',
  ])
    assert.ok(spec.paths[path], path);
  assert.ok(spec.components.schemas.ShiftCommand.oneOf.length >= 10);
  const response = await h.request('/api/integrations/v1/profiles', undefined, 'GET', {
    Authorization: 'Bearer test-only-key-not-for-deployment-123456',
  });
  assert.equal(response.status, 200);
  assert.equal(response.data.items[0].notForEmploymentDecisions, true);
  assert.equal(response.data.items[0].practiceV2.schemaVersion, 2);
});
