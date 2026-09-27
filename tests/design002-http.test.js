import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../backend/http.js';
import { commandFor } from '../src/shift-view.js';
import { randomUUID } from 'node:crypto';
test('Design002 HTTP: full route, all classes, reload, score persistence and admin status', async (t) => {
  const app = createApp({
    database: ':memory:',
    sweep: false,
    rateLimit: 10000,
    sessionLimit: 100,
  });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => app.server.close(r)));
  const origin = 'http://127.0.0.1:' + app.server.address().port;
  const session = await fetch(origin + '/api/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-reis-client': 'web' },
    body: '{}',
  });
  assert.equal(session.status, 201);
  const cookie = session.headers.get('set-cookie').split(';')[0];
  async function req(path, body) {
    const response = await fetch(origin + '/api' + path, {
      method: body ? 'POST' : 'GET',
      headers: { cookie, 'content-type': 'application/json', 'x-reis-client': 'web' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const out = await response.json();
    assert.ok(response.ok, JSON.stringify(out));
    return out;
  }
  let total = 0;
  for (const serviceClass of ['standard', 'comfort', 'business', 'first']) {
    let r = await req('/v2/runs', {
      requestId: randomUUID(),
      scenarioId: 'design002',
      mode: 'training',
      timingPolicyId: 'extended',
      serviceClass,
      variantId: 'orientation',
    });
    let guard = 0;
    while (!r.result && guard++ < 80) {
      const a =
        r.actions.find((a) => a.command === 'begin') ||
        r.actions.find((a) => a.command === 'choose' && a.available !== false) ||
        r.actions.find((a) => a.command === 'focus') ||
        r.actions.find((a) => a.command === 'continue') ||
        r.actions.find((a) => a.command === 'inspect');
      const body = { requestId: randomUUID(), revision: r.revision, command: commandFor(a) };
      const response = await req('/v2/runs/' + r.id + '/commands', body);
      r = response.run;
    }
    assert.equal(r.phase, 'result');
    assert.equal(r.step, r.totalTurns);
    const loaded = await req('/runs/' + r.id);
    assert.deepEqual(loaded.result, r.result);
    total = Math.round((total + r.result.competencyGain) * 100) / 100;
    assert.equal((await req('/bootstrap')).competency.points, total);
    assert.equal((await req('/v2/runs/' + r.id + '/replay')).verified, true);
  }
  const health = await req('/health');
  assert.equal(health.engine, 'shift-4');
  const leaders = await req('/v2/competency/leaderboard?scope=company');
  assert.equal(leaders.rows.find((r) => r.me).score, total);
  const admin = await req('/admin/users');
  assert.equal(admin.items[0].competencyPoints, total);
  assert.equal(admin.items[0].status, 'completed');
});
