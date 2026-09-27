import test from 'node:test';
import assert from 'node:assert/strict';
import { DESIGN002_CONTENT } from '../backend/design002-content.js';
import {
  createDesignShift,
  reduceDesignShift,
  publicDesignShift,
  expireDesignShift,
} from '../backend/design002-engine.js';
import { commandFor } from '../src/shift-view.js';
import { harness } from './shift-helper.js';
const now = 1800000000000;
const content = () => ({ ...structuredClone(DESIGN002_CONTENT), interactionVersion: 1 });
function fixture(c = content()) {
  let s = createDesignShift(
    c,
    {
      id: 'card-flow',
      profileId: 'test',
      mode: 'training',
      serviceClass: 'standard',
      timingPolicyId: 'standard',
      variantId: 'full',
    },
    now
  );
  s = reduceDesignShift(s, { type: 'begin' }, c, now);
  c.problems.seat.choices = [
    { id: 'ask', label: 'Уточнить', text: 'Пассажир показывает билет.', dialogue: 'details' },
    {
      id: 'ignore',
      label: 'Не проверять',
      text: 'Пассажир остался без помощи.',
      points: 0,
      loyalty: -10,
    },
  ];
  c.problems.seat.dialogue = {
    details: {
      speaker: 'Пассажир',
      text: 'Где моё место?',
      choices: [
        {
          id: 'help',
          label: 'Проводить к месту',
          text: 'Пассажир нашёл своё место.',
          points: 2,
          loyalty: 5,
        },
        {
          id: 'send',
          label: 'Объяснить расположение',
          text: 'Пассажир разобрался по схеме.',
          points: 1,
        },
      ],
    },
  };
  s.problems = [1, 2].map((n) => ({
    id: 'p' + n,
    templateId: 'seat',
    seat: 8 + n,
    at: 0,
    appearedTurn: 0,
    expiresTurn: 100,
    hidden: false,
    revealed: true,
    status: 'active',
    node: 'start',
    startedAt: null,
    appearanceOrder: n,
    knownOrder: n,
  }));
  return { c, s };
}
const apply = (s, command, c) => reduceDesignShift(s, command, c, now);
function choose(s, id, c) {
  const action = publicDesignShift(s, c, now).actions.find(
    (a) => a.command === 'choose' && a.actionId === id
  );
  assert.ok(action, `missing choice ${id}`);
  return apply(s, commandFor(action), c);
}
test('opened dialogue locks navigation on server; nested choices and terminal acknowledgement stay in the card', () => {
  let { s, c } = fixture();
  s = apply(s, { type: 'focus', incidentId: 'p1' }, c);
  for (const cmd of [
    { type: 'overview' },
    { type: 'focus', incidentId: 'p2' },
    { type: 'task', taskId: 't1' },
    { type: 'inspect', zoneId: 'carriage', actionId: 'inspect' },
  ])
    assert.throws(() => apply(s, cmd, c), { code: 'ACTION_NOT_AVAILABLE' });
  s = choose(s, 'ask', c);
  assert.equal(s.step, 0);
  assert.equal(s.phase, 'scene');
  assert.equal(publicDesignShift(s, c, now).scene.text, 'Где моё место?');
  s = choose(s, 'help', c);
  assert.equal(s.step, 1);
  assert.equal(s.phase, 'acknowledgement');
  assert.equal(s.acknowledgement.text, 'Пассажир нашёл своё место.');
  assert.equal(s.acknowledgement.incidentId, 'p1');
  assert.equal(s.tasks[0].status, 'failed');
  assert.ok(s.acknowledgement.events.some((e) => e.type === 'task_failed'));
  assert.deepEqual(
    publicDesignShift(s, c, now).actions.map((a) => a.command),
    ['continue']
  );
  const log = structuredClone(s.log),
    passengers = structuredClone(s.passengers);
  s = apply(structuredClone(s), { type: 'continue' }, c);
  assert.equal(s.step, 1);
  assert.equal(s.phase, 'overview');
  assert.equal(s.acknowledgement, null);
  assert.deepEqual(s.log, log);
  assert.deepEqual(s.passengers, passengers);
  assert.ok(publicDesignShift(s, c, now).actions.some((a) => a.incidentId === 'p2'));
});
test('task execution and an empty inspection have durable results with zero-cost acknowledgement', () => {
  let { s, c } = fixture();
  s = apply(s, { type: 'task', taskId: 't1' }, c);
  assert.equal(s.acknowledgement.kind, 'task');
  assert.equal(s.acknowledgement.taskId, 't1');
  assert.equal(s.tasks[0].status, 'completed');
  s = apply(s, { type: 'continue' }, c);
  s = apply(s, { type: 'inspect', zoneId: 'carriage', actionId: 'inspect' }, c);
  assert.equal(s.acknowledgement.kind, 'inspection');
  assert.match(s.acknowledgement.text, /не обнаружено/);
  const steps = s.step;
  s = apply(s, { type: 'continue' }, c);
  assert.equal(s.step, steps);
});
test('final work result is persisted immediately and acknowledgement cannot advance or change score', () => {
  let { s, c } = fixture();
  s.step = s.totalTurns - 1;
  s = apply(s, { type: 'focus', incidentId: 'p1' }, c);
  s = choose(s, 'ask', c);
  s = choose(s, 'help', c);
  assert.equal(s.phase, 'result');
  assert.ok(s.result);
  assert.equal(s.acknowledgement.text, 'Пассажир нашёл своё место.');
  assert.equal(s.result.shiftScore, Math.round((s.result.fact / s.result.max) * 10000) / 100);
  assert.deepEqual(expireDesignShift(s, c, now + 999999), s);
  const result = structuredClone(s.result),
    step = s.step;
  s = apply(s, { type: 'continue' }, c);
  assert.equal(s.phase, 'result');
  assert.equal(s.acknowledgement, null);
  assert.equal(s.step, step);
  assert.deepEqual(s.result, result);
  assert.deepEqual(publicDesignShift(s, c, now).actions, []);
});
test('critical timeout remains in its card and permits only acknowledgement', () => {
  let { s, c } = fixture();
  s.problems[0].templateId = 'medical';
  s = apply(s, { type: 'focus', incidentId: 'p1' }, c);
  s = expireDesignShift(s, c, now + 60000);
  assert.equal(s.acknowledgement.kind, 'problem');
  assert.equal(s.acknowledgement.incidentId, 'p1');
  assert.equal(s.criticalWindow, null);
  assert.equal(s.step, 1);
  assert.deepEqual(
    publicDesignShift(s, c, now).actions.map((a) => a.command),
    ['continue']
  );
});
test('choice ordering is deterministic across refresh and differs across seeded runs', () => {
  const { s, c } = fixture();
  const order = (state) =>
    publicDesignShift(apply(state, { type: 'focus', incidentId: 'p1' }, c), c, now)
      .actions.filter((a) => a.command === 'choose')
      .map((a) => a.actionId)
      .join(',');
  assert.equal(order(s), order(structuredClone(s)));
  assert.ok(
    new Set(Array.from({ length: 20 }, (_, i) => order({ ...s, seed: 'seed' + i }))).size > 1
  );
});
test('pinned prior interactions retain navigation and immediate overview without acknowledgement', () => {
  let { s, c } = fixture();
  delete s.interactionVersion;
  delete s.acknowledgement;
  s = apply(s, { type: 'focus', incidentId: 'p1' }, c);
  assert.ok(publicDesignShift(s, c, now).actions.some((a) => a.command === 'overview'));
  s = choose(s, 'ignore', c);
  assert.equal(s.phase, 'overview');
  assert.equal(s.acknowledgement, undefined);
});
test('API acknowledgement survives reload and retries; final result and exact replay remain consistent', (t) => {
  const h = harness();
  t.after(() => h.store.close());
  h.start({ scenarioId: 'design002', variantId: 'orientation' });
  if (h.run.phase === 'briefing') h.act('begin');
  // The content publication enables the new card flow.
  assert.equal(h.run.interactionVersion, 1);
  h.act('task');
  assert.ok(h.run.acknowledgement);
  const request = { requestId: h.key(), revision: h.run.revision, command: { type: 'continue' } };
  const reply = h.v2.command(h.profile, h.run.id, request);
  assert.equal(reply.status, 200);
  assert.deepEqual(h.v2.command(h.profile, h.run.id, request), JSON.parse(JSON.stringify(reply)));
  h.run = reply.body.run;
  assert.deepEqual(h.v2.get(h.profile, h.run.id), h.run);
  for (let i = 0; i < 100 && !h.run.result; i++) {
    if (h.run.acknowledgement || h.run.pendingInspection) h.act('continue');
    else h.act('inspect');
  }
  assert.ok(h.run.result);
  assert.ok(h.run.acknowledgement);
  const score = h.run.result.shiftScore;
  h.act('continue');
  assert.equal(h.run.result.shiftScore, score);
  assert.equal(h.run.phase, 'result');
  assert.equal(h.v2.exactReplay(h.profile, h.run.id).verified, true);
  assert.equal(h.store.get('SELECT COUNT(*) AS n FROM results WHERE run_id=?', h.run.id).n, 1);
});

test('dialogue response fills the actual seat without changing pinned legacy dialogue text', () => {
  let { s, c } = fixture();
  c.problems.seat.choices[0].text = 'Мой билет: место {seat}.';
  s = apply(s, { type: 'focus', incidentId: 'p1' }, c);
  const legacy = structuredClone(s);
  delete legacy.interactionVersion;
  delete legacy.acknowledgement;
  s = choose(s, 'ask', c);
  assert.equal(s.log.findLast((e) => e.type === 'dialogue').text, 'Мой билет: место 9.');
  assert.equal(
    publicDesignShift(s, c, now).log.findLast((e) => e.type === 'dialogue').text,
    'Мой билет: место 9.'
  );
  const old = choose(legacy, 'ask', c);
  assert.equal(old.log.findLast((e) => e.type === 'dialogue').text, 'Мой билет: место {seat}.');
});
