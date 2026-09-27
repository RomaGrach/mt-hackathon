import test from 'node:test';
import assert from 'node:assert/strict';
import { DESIGN002_CONTENT as c, validateDesign002 } from '../backend/design002-content.js';
import {
  createDesignShift as create,
  reduceDesignShift as reduce,
  publicDesignShift as view,
  expireDesignShift as expire,
} from '../backend/design002-engine.js';
import { harness } from './shift-helper.js';
import { commandFor } from '../src/shift-view.js';
const now = 1800000000000;
function start(id = 'seed-one', variantId = 'full') {
  return reduce(
    create(
      c,
      {
        id,
        profileId: 'tester',
        mode: 'training',
        serviceClass: 'standard',
        timingPolicyId: 'standard',
        variantId,
      },
      now
    ),
    { type: 'begin' },
    c,
    now
  );
}
const act = (s, cmd) => reduce(s, cmd, c, now);
function focus(s, p) {
  return act(s, { type: 'focus', incidentId: p.id });
}
function choose(s, id) {
  const a = view(s, c, now).actions.find((a) => a.command === 'choose' && a.actionId === id);
  assert.ok(a);
  return act(s, commandFor(a));
}
function fixture(templateId, hidden = false) {
  const s = start();
  s.problems = [
    {
      id: 'p1',
      templateId,
      seat: 18,
      at: 0,
      appearedTurn: 0,
      expiresTurn: 8,
      hidden,
      revealed: !hidden,
      status: 'active',
      node: 'start',
      startedAt: null,
      appearanceOrder: 1,
      knownOrder: 1,
    },
  ];
  s.tasks = [];
  s.passengers = [
    { id: 'p18', seat: 18, loyalty: 75 },
    { id: 'p19', seat: 19, loyalty: 75 },
  ];
  s.log = [];
  s.lastEventSeq = 0;
  return s;
}
test('Design002: content validates, bounded varied pools, exact quotas and no duplicate base cases', () => {
  assert.deepEqual(validateDesign002(c), []);
  const layouts = new Set();
  for (const variantId of Object.keys(c.variants))
    for (let i = 0; i < 60; i++) {
      const s = start('seed-' + i, variantId),
        v = c.variants[variantId];
      assert.equal(
        s.problems.length,
        Object.values(v.quotas).reduce((a, b) => a + b, 0)
      );
      assert.equal(new Set(s.problems.map((p) => p.templateId)).size, s.problems.length);
      assert.equal(s.problems.filter((p) => p.hidden).length, v.hidden);
      assert.ok(s.problems.length + s.tasks.length > s.totalTurns);
      layouts.add(s.problems.map((p) => `${p.templateId}:${p.seat}:${p.at}`).join('|'));
    }
  assert.ok(layouts.size > 100);
  assert.deepEqual(start('fixed'), start('fixed'));
});
test('Design002: observation is free; one resolved stage costs one turn; no wait command or visible secrets', () => {
  let s = fixture('seat'),
    p = s.problems[0];
  s = focus(s, p);
  assert.equal(s.step, 0);
  const publicState = view(s, c, now),
    json = JSON.stringify(publicState);
  for (const key of ['expiresTurn', 'category', 'quotas', 'hiddenEligible', 'seed'])
    assert.ok(!json.includes('"' + key + '"'));
  assert.ok(!publicState.actions.some((a) => a.command === 'wait'));
  assert.throws(() => act(s, { type: 'wait' }));
  s = choose(s, 'verify');
  assert.equal(s.step, 1);
  assert.equal(s.problems[0].points, 2);
  assert.equal(s.scales.safety, 90);
  assert.equal(s.scales.loyalty, 81);
});
test('Design002: inspection + one discovered resolution costs exactly one turn and cannot be exploited', () => {
  let s = fixture('aisle', true);
  s.problems.push({ ...s.problems[0], id: 'p2', templateId: 'socket', seat: 19 });
  const before = view(s, c, now);
  assert.equal(before.incidents.length, 0);
  s = act(s, { type: 'inspect', zoneId: 'carriage', actionId: 'inspect' });
  assert.equal(s.step, 0);
  assert.equal(view(s, c, now).incidents.length, 2);
  assert.throws(() => act(s, { type: 'inspect', zoneId: 'carriage', actionId: 'inspect' }));
  s = focus(s, s.problems[0]);
  s = choose(s, 'rack');
  assert.equal(s.step, 1);
  assert.equal(s.pendingInspection, null);
  s = focus(s, s.problems[1]);
  s = choose(s, 'isolate');
  assert.equal(s.step, 2);
});
test('Design002: declining resolution still consumes the inspection turn, including the final turn', () => {
  let s = fixture('aisle', true);
  s.step = s.totalTurns - 1;
  s = act(s, { type: 'inspect', zoneId: 'carriage', actionId: 'inspect' });
  assert.equal(s.phase, 'overview');
  s = act(s, { type: 'continue' });
  assert.equal(s.phase, 'result');
  assert.equal(s.result.problems[0].points, 0);
});
test('Design002: linked stages and costful tasks alter future work; tasks give no competence', () => {
  let s = fixture('seat');
  s = focus(s, s.problems[0]);
  s = choose(s, 'move');
  assert.equal(s.problems.length, 2);
  assert.equal(s.problems[1].status, 'scheduled');
  s = act(s, { type: 'inspect', zoneId: 'carriage', actionId: 'inspect' });
  assert.equal(s.problems[1].status, 'active');
  let t = fixture('blanket');
  t = choose(focus(t, t.problems[0]), 'bring');
  assert.equal(t.tasks.length, 1);
  t = act(t, { type: 'task', taskId: t.tasks[0].id });
  assert.equal(t.step, 2);
  assert.equal(t.problems[0].points, 2);
});
test('Design002: hidden deadlines use the worst outcome and leave a visible causal log', () => {
  let s = fixture('aisle', true);
  s.problems[0].expiresTurn = 1;
  // Completing a separate duty advances the world without discovering the aisle problem.
  s.tasks = [{ id: 't1', templateId: 'service', label: 'Обслуживание', seat: 0, status: 'open' }];
  s = act(s, { type: 'task', taskId: 't1' });
  assert.equal(s.problems[0].resolution, 'deadline');
  assert.equal(s.problems[0].revealed, false);
  assert.ok(view(s, c, now).log.some((e) => e.type === 'automatic'));
  assert.equal(s.problems[0].points, 0);
});
test('Design002: critical timer begins on entry; multi-line dialogue keeps the deadline and one-tact cost', () => {
  let s = fixture('medical');
  assert.equal(s.criticalWindow, null);
  s = focus(s, s.problems[0]);
  const deadline = s.criticalWindow.deadline;
  s = choose(s, 'call');
  assert.equal(s.step, 0);
  assert.equal(s.criticalWindow.deadline, deadline);
  s = choose(s, 'facts');
  assert.equal(s.step, 1);
  assert.equal(s.criticalWindow, null);
  assert.equal(s.problems[0].points, 2);
});
test('Design002: timeout and safety zero are not universal failures, explicit fatal outcomes are', () => {
  let s = fixture('medical');
  s = focus(s, s.problems[0]);
  s.scales.safety = 0;
  s = expire(s, c, now + 60000);
  assert.equal(s.phase, 'overview');
  assert.equal(s.step, 1);
  assert.equal(s.scales.safety, 0);
  let f = fixture('smoke');
  f = focus(f, f.problems[0]);
  f = expire(f, c, now + 60000);
  assert.equal(f.phase, 'result');
  assert.equal(f.result.passed, false);
});
test('Design002: last turn closes all hidden, scheduled and known problems/tasks; denominator includes misses', () => {
  let s = fixture('seat');
  s.problems.push({
    ...s.problems[0],
    id: 'p2',
    templateId: 'aisle',
    hidden: true,
    revealed: false,
  });
  s.tasks = [
    { id: 't1', templateId: 'bring-tea', label: 'Принести чай', status: 'open', seat: 18 },
  ];
  s.step = s.totalTurns - 1;
  s = choose(focus(s, s.problems[0]), 'verify');
  assert.equal(s.phase, 'result');
  assert.equal(s.result.fact, 2);
  assert.equal(s.result.max, 4);
  assert.equal(s.result.shiftScore, 50);
  assert.equal(s.result.competencyGain, 50);
  assert.equal(s.result.tasks[0].status, 'failed');
  assert.ok(s.problems.every((p) => p.status === 'resolved'));
});
test('Design002: at most one active critical issue for every generated seed and policy', () => {
  for (let i = 0; i < 70; i++) {
    let s = start('critical-' + i);
    let guard = 0;
    while (!s.result && guard++ < 150) {
      assert.ok(
        s.problems.filter(
          (p) => p.status === 'active' && c.problems[p.templateId].category === 'critical'
        ).length <= 1
      );
      const a =
        view(s, c, now).actions.find((a) => a.command === 'continue') ||
        view(s, c, now).actions.find((a) => a.command === 'inspect');
      s = act(s, commandFor(a));
    }
    assert.ok(s.result);
    assert.ok(s.result.shiftScore >= 0 && s.result.shiftScore <= 100);
  }
});
test('Design002: service persists exact replay, idempotent commands and cumulative competence without acknowledgment', (t) => {
  const h = harness();
  t.after(() => h.store.close());
  h.start({ scenarioId: 'design002', variantId: 'orientation', timingPolicyId: 'extended' });
  h.act('begin');
  let guard = 0;
  while (!h.run.result && guard++ < 100) {
    const r = h.run,
      a =
        r.actions.find((a) => a.command === 'choose' && a.available !== false) ||
        r.actions.find((a) => a.command === 'focus') ||
        r.actions.find((a) => a.command === 'continue') ||
        r.actions.find((a) => a.command === 'inspect');
    const body = { requestId: h.key(), revision: r.revision, command: commandFor(a) };
    const first = h.v2.command(h.profile, r.id, body),
      second = h.v2.command(h.profile, r.id, body);
    assert.equal(JSON.stringify(second), JSON.stringify(first));
    assert.equal(first.status, 200);
    h.run = first.body.run;
  }
  assert.ok(h.run.result);
  assert.equal(h.v2.exactReplay(h.profile, h.run.id).verified, true);
  const gain = h.run.result.competencyGain,
    boot = h.service.bootstrap(h.profile);
  assert.equal(boot.competency.points, gain);
  h.v2.get(h.profile, h.run.id);
  h.ack();
  h.ack();
  assert.equal(h.service.bootstrap(h.profile).competency.points, gain);
  assert.equal(
    h.v2.competencyLeaders(h.profile, 'company', 0, 50).rows.find((r) => r.me).score,
    gain
  );
});
test('Design002: conditions, missed acceptance and prevention are real state changes', () => {
  let s = fixture('water');
  s = choose(focus(s, s.problems[0]), 'secure');
  let blocked = view(s, c, now).actions.find(
    (a) => a.taskId === s.tasks.find((t) => t.templateId === 'check-floor').id
  );
  assert.equal(blocked.available, false);
  assert.throws(() => act(s, { type: 'task', taskId: blocked.taskId }));
  s = act(s, { type: 'task', taskId: s.tasks.find((t) => t.templateId === 'clean-floor').id });
  assert.equal(view(s, c, now).actions.find((a) => a.taskId === blocked.taskId).available, true);
  let n = fixture('noise');
  n = choose(focus(n, n.problems[0]), 'follow');
  n = act(n, { type: 'task', taskId: n.tasks[0].id });
  n = act(n, { type: 'inspect', zoneId: 'carriage', actionId: 'inspect' });
  assert.equal(n.problems[1].status, 'prevented');
  let r = start('risk-seed');
  for (let i = 0; i < 3; i++) {
    const cmd =
      view(r, c, now).actions.find((a) => a.command === 'continue') ||
      view(r, c, now).actions.find((a) => a.command === 'inspect');
    r = act(r, commandFor(cmd));
    if (r.pendingInspection) r = act(r, { type: 'continue' });
  }
  assert.ok(r.problems.some((p) => p.templateId === 'acceptance-defect'));
});
test('Design002: late command commits timeout once and a second completed shift adds its score', (t) => {
  const h = harness();
  t.after(() => h.store.close());
  h.start({ scenarioId: 'design002', variantId: 'full' });
  h.act('begin');
  // Preserve storage invariants while reaching the first critical through offered actions.
  let guard = 0;
  while (!h.run.criticalWindow && !h.run.result && guard++ < 100) {
    const loaded = h.v2.load(h.profile, h.run.id).s;
    const critical = loaded.problems.find(
      (p) => p.status === 'active' && p.revealed && c.problems[p.templateId].category === 'critical'
    );
    const a = critical
      ? h.run.actions.find((a) => a.command === 'focus' && a.incidentId === critical.id)
      : h.run.actions.find((a) => a.command === 'continue') ||
        h.run.actions.find((a) => a.command === 'inspect');
    h.run = h.v2.command(h.profile, h.run.id, {
      requestId: h.key(),
      revision: h.run.revision,
      command: commandFor(a),
    }).body.run;
  }
  assert.ok(h.run.criticalWindow);
  const id = h.run.id,
    body = {
      requestId: h.key(),
      revision: h.run.revision,
      command: commandFor(
        h.run.actions.find((a) => a.command === 'choose' && a.available !== false)
      ),
    };
  h.now = h.run.criticalWindow.deadline;
  const response = h.v2.command(h.profile, id, body);
  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, 'DEADLINE_EXPIRED');
  const step = h.v2.get(h.profile, id).step;
  h.v2.command(h.profile, id, body);
  assert.equal(h.v2.get(h.profile, id).step, step);
  assert.equal(h.v2.get(h.profile, id).log.filter((e) => e.type === 'critical_timeout').length, 1);
  h.run = h.v2.get(h.profile, id);
  if (!h.run.result) h.act('abort');
  const before = h.service.bootstrap(h.profile).competency.points;
  h.start({ scenarioId: 'design002', variantId: 'orientation', timingPolicyId: 'extended' });
  h.act('begin');
  guard = 0;
  while (!h.run.result && guard++ < 100) {
    const a =
      h.run.actions.find((a) => a.command === 'choose' && a.available !== false) ||
      h.run.actions.find((a) => a.command === 'focus') ||
      h.run.actions.find((a) => a.command === 'continue') ||
      h.run.actions.find((a) => a.command === 'inspect');
    h.run = h.v2.command(h.profile, h.run.id, {
      requestId: h.key(),
      revision: h.run.revision,
      command: commandFor(a),
    }).body.run;
  }
  assert.equal(
    h.service.bootstrap(h.profile).competency.points,
    Math.round((before + h.run.result.competencyGain) * 100) / 100
  );
});
test('Design002: conditional dialogue option becomes available after service preparation', () => {
  let s = fixture('tea');
  s = focus(s, s.problems[0]);
  assert.equal(view(s, c, now).actions.find((a) => a.actionId === 'serve-now').available, false);
  assert.throws(() => choose(s, 'serve-now'));
  s.flags.served = true;
  assert.equal(view(s, c, now).actions.find((a) => a.actionId === 'serve-now').available, true);
  s = choose(s, 'serve-now');
  assert.equal(s.step, 1);
  assert.equal(s.tasks.length, 0);
});
