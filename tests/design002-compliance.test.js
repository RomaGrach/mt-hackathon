import test from 'node:test';
import assert from 'node:assert/strict';
import { DESIGN002_CONTENT as c, validateDesign002 } from '../backend/design002-content.js';
import {
  createDesignShift as create,
  reduceDesignShift as reduce,
  publicDesignShift as view,
  expireDesignShift as expire,
} from '../backend/design002-engine.js';
import { designShift, designHome } from '../src/design002-view.js';
import { courseLessons, lessonPassed } from '../src/course.js';
import { commandFor } from '../src/shift-view.js';
import { harness } from './shift-helper.js';
const now = 1800000000000;
const opts = {
  id: 'compliance',
  profileId: 'tester',
  mode: 'training',
  serviceClass: 'standard',
  timingPolicyId: 'standard',
  variantId: 'orientation',
};
const act = (s, cmd) => reduce(s, cmd, c, now);
function fixture(id) {
  const s = act(create(c, opts, now), { type: 'begin' });
  s.tasks = [];
  s.log = [];
  s.lastEventSeq = 0;
  s.problems = [
    {
      id: 'p1',
      templateId: id,
      seat: 18,
      at: 0,
      appearedTurn: 0,
      expiresTurn: 50,
      hidden: false,
      revealed: true,
      status: 'active',
      node: 'start',
      startedAt: null,
      appearanceOrder: 1,
      knownOrder: 1,
    },
  ];
  s.passengers = [
    { id: 'passenger18', seat: 18, loyalty: 75 },
    { id: 'passenger19', seat: 19, loyalty: 75 },
  ];
  return s;
}
function focus(s, p = s.problems[0]) {
  return act(s, { type: 'focus', incidentId: p.id });
}
function choose(s, id) {
  const a = view(s, c, now).actions.find((a) => a.command === 'choose' && a.actionId === id);
  assert.ok(a);
  return act(s, commandFor(a));
}
test('A1: every new shift critical policy has a real deadline, including linked introductory cases', () => {
  assert.throws(() => create(c, { ...opts, timingPolicyId: 'untimed' }, now), {
    code: 'INVALID_OPTIONS',
  });
  const invalid = structuredClone(c);
  invalid.timingPolicies.untimed = null;
  assert.ok(validateDesign002(invalid).some((e) => e.includes('timer')));
  let s = fixture('socket');
  s = choose(focus(s), 'other');
  // The selected root choice schedules hot-socket, even in orientation.
  while (!s.problems.some((p) => p.templateId === 'hot-socket' && p.status === 'active'))
    s = act(s, { type: 'inspect', zoneId: 'carriage', actionId: 'inspect' });
  s = focus(
    s,
    s.problems.find((p) => p.templateId === 'hot-socket')
  );
  assert.equal(s.criticalWindow.deadline, now + 60000);
  const again = focus(
    act(s, { type: 'overview' }),
    s.problems.find((p) => p.templateId === 'hot-socket')
  );
  assert.equal(again.criticalWindow.deadline, s.criticalWindow.deadline);
  assert.equal(
    expire(s, c, now + 60000).problems.find((p) => p.templateId === 'hot-socket').resolution,
    'timeout'
  );
});
test('A2: final-turn prevention removes future problem from worst outcomes and score denominator', () => {
  let s = fixture('noise');
  s.step = s.totalTurns - 2;
  s = choose(focus(s), 'follow');
  s = act(s, { type: 'task', taskId: s.tasks[0].id });
  assert.equal(s.phase, 'result');
  assert.equal(s.problems[1].status, 'prevented');
  assert.equal(s.result.max, 2);
  assert.equal(s.result.fact, 1);
  assert.equal(s.result.shiftScore, 50);
  const prevention = s.result.history.find((e) => e.type === 'prevented');
  assert.equal(
    s.result.history.find((e) => e.eventId === prevention.causeEventId).type,
    'task_completed'
  );
});
test('A3/A4/A8: primary fatal cause survives end cleanup; all critical errors and dialogue alternatives remain', () => {
  let s = fixture('medical');
  s.problems.push({
    ...s.problems[0],
    id: 'p2',
    templateId: 'smoke',
    status: 'scheduled',
    at: 20,
    revealed: false,
  });
  s = choose(focus(s), 'tablet');
  assert.equal(s.fatal.problemId, 'p1');
  assert.deepEqual(s.result.reasons, [
    c.problems.medical.choices.find((o) => o.id === 'tablet').text,
  ]);
  assert.equal(s.result.stats.criticalFailed, 2);
  const alternative = s.result.problems[0].alternative;
  assert.match(alternative, /Организовать связь/);
  assert.match(alternative, /Передать место/);
  let t = focus(fixture('medical'));
  t = expire(t, c, now + 60000);
  assert.equal(t.phase, 'overview');
  t = act(t, { type: 'abort' });
  assert.equal(t.result.criticalErrors.length, 1);
  assert.equal(t.result.criticalError, true);
  assert.equal(t.result.criticalErrors[0].fatal, false);
});
test('A5/A6/A9: visible personal loyalty, complete score basis, and no action time badges', () => {
  let s = focus(fixture('seat'));
  const html = designShift(view(s, c, now));
  assert.match(html, /Лояльность пассажира на месте 18/);
  assert.doesNotMatch(html, /d2-cost|1 ход<|\d+\s*(?:секунд|минут)/);
  s = choose(s, 'verify');
  s = act(s, { type: 'abort' });
  const result = designShift(view(s, c, now));
  assert.match(result, /Баллы за проблемы: <b>2 \/ 2<\/b>/);
  assert.match(result, /Критических ошибок: 0/);
  assert.equal((result.match(/<details class="d2-result-group"/g) || []).length, 4);
});
test('A7: profile analysis includes unfinished obligations with their actual consequences', (t) => {
  const h = harness();
  t.after(() => h.store.close());
  h.start({ scenarioId: 'design002', variantId: 'orientation' });
  h.act('begin');
  h.act('abort');
  const p = h.service.bootstrap(h.profile).competency;
  const duty = p.mistakes.find((m) => m.kind === 'task' && m.title.includes('Принять вагон'));
  assert.ok(duty);
  assert.match(duty.text, /Приёмка не выполнена/);
  assert.equal(h.v2.exactReplay(h.profile, h.run.id).verified, true);
});
test('A10: cleaning and checking are scoped to the same problem, global preparation still works', () => {
  let s = fixture('water');
  s.problems.push({ ...s.problems[0], id: 'p2', seat: 19, knownOrder: 2 });
  s = choose(focus(s), 'secure');
  s = choose(focus(s, s.problems[1]), 'secure');
  const first = s.tasks.find((t) => t.templateId === 'clean-floor' && t.parentId === 'p1');
  s = act(s, { type: 'task', taskId: first.id });
  for (const t of s.tasks.filter((t) => t.templateId === 'check-floor')) {
    const a = view(s, c, now).actions.find((a) => a.taskId === t.id);
    assert.equal(a.available, t.parentId === 'p1');
    if (t.parentId === 'p2')
      assert.throws(() => act(s, { type: 'task', taskId: t.id }), { code: 'ACTION_NOT_AVAILABLE' });
  }
});
test('new course and custom practice cannot disable timers; previously completed first lesson stays passed', () => {
  const catalog = {
    engineVersion: c.engineVersion,
    id: c.id,
    classes: Object.entries(c.policies).map(([id, p]) => ({ id, label: p.label })),
    trainingVariants: Object.values(c.variants),
  };
  const lessons = courseLessons(catalog);
  assert.ok(lessons.every((l) => Number.isFinite(c.timingPolicies[l.timingPolicyId])));
  assert.equal(
    lessonPassed(lessons[0], [{ ...lessons[0], passed: true, timingPolicyId: 'untimed' }]),
    true
  );
  const html = designHome({
    boot: { shiftCatalog: [catalog], competency: { points: 0, level: 1, history: [] } },
    tutorialSeen: true,
  });
  assert.doesNotMatch(html, /untimed|Без ограничения/);
});
