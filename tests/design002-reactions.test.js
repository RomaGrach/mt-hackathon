import test from 'node:test';
import assert from 'node:assert/strict';
import { DESIGN002_CONTENT as c } from '../backend/design002-content.js';
import {
  createDesignShift as create,
  reduceDesignShift as reduce,
  publicDesignShift as view,
  expireDesignShift as expire,
} from '../backend/design002-engine.js';
import { designShift } from '../src/design002-view.js';
import { commandFor } from '../src/shift-view.js';
import { harness } from './shift-helper.js';
const now = 1800000000000;
const options = {
  id: 'reactions',
  profileId: 'tester',
  mode: 'training',
  serviceClass: 'standard',
  variantId: 'full',
  timingPolicyId: 'standard',
};
const act = (s, cmd, content = c) => {
  if (s.acknowledgement && cmd.type !== 'continue')
    s = reduce(s, { type: 'continue' }, content, now);
  return reduce(s, cmd, content, now);
};
const inspect = (s, content = c) =>
  act(s, { type: 'inspect', zoneId: 'carriage', actionId: 'inspect' }, content);
function start(content = c) {
  return act(create(content, options, now), { type: 'begin' }, content);
}
function fixture(id, content = c) {
  const s = start(content);
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
  return s;
}
function choose(s, id, content = c) {
  if (s.phase !== 'scene') s = act(s, { type: 'focus', incidentId: 'p1' }, content);
  for (let i = 0; i < 8 && s.phase === 'scene'; i++) {
    const a = view(s, content, now).actions.find(
      (a) => a.command === 'choose' && a.actionId === id
    );
    assert.ok(a, `Expected branch ${id}`);
    s = act(s, commandFor(a), content);
  }
  assert.notEqual(s.phase, 'scene');
  return s;
}
test('acceptance closes after another first work action, never after navigation; deferred defect appears once', () => {
  let s = fixture('seat');
  s = act(s, { type: 'focus', incidentId: 'p1' });
  assert.equal(s.step, 0);
  assert.equal(s.tasks[0].status, 'open');
  s = choose(s, 'verify');
  assert.equal(s.step, 1);
  assert.equal(s.tasks[0].status, 'failed');
  assert.ok(!view(s, c, now).actions.some((a) => a.taskId === s.tasks[0].id));
  const risk = s.problems.find((p) => p.templateId === 'acceptance-defect');
  assert.equal(risk.status, 'scheduled');
  assert.equal(risk.at, 3);
  assert.equal(s.log.filter((e) => e.type === 'task_failed' && e.taskId === 't1').length, 1);
  s = inspect(s);
  s = inspect(s);
  assert.equal(s.problems.find((p) => p.id === risk.id).status, 'active');
  s = inspect(s);
  assert.equal(s.problems.filter((p) => p.templateId === 'acceptance-defect').length, 1);
  assert.equal(s.log.filter((e) => e.type === 'task_failed' && e.taskId === 't1').length, 1);
  const clean = act(start(), { type: 'task', taskId: 't1' });
  assert.equal(clean.tasks[0].status, 'completed');
  assert.ok(!clean.problems.some((p) => p.templateId === 'acceptance-defect'));
});
test('a newly promised one-turn task remains actionable for the next action and expires once if ignored', () => {
  const content = structuredClone(c);
  content.tasks['bring-blanket'].ttl = 1;
  let s = choose(fixture('blanket', content), 'bring', content);
  const task = s.tasks.find((t) => t.templateId === 'bring-blanket');
  assert.equal(task.expiresTurn, 2);
  assert.equal(s.step, 1);
  assert.equal(task.status, 'open');
  const completed = act(s, { type: 'task', taskId: task.id }, content);
  assert.equal(completed.tasks.find((t) => t.id === task.id).status, 'completed');
  s = inspect(s, content);
  assert.equal(s.tasks.find((t) => t.id === task.id).status, 'failed');
  s = inspect(s, content);
  assert.equal(s.log.filter((e) => e.type === 'task_failed' && e.taskId === task.id).length, 1);
  const json = JSON.stringify(view(s, content, now));
  assert.ok(!json.includes('expiresTurn'));
  assert.ok(!json.includes('"ttl"'));
});
test('overview groups open problems above tasks; inspection keeps only its found problems inside its card', () => {
  let s = fixture('seat');
  s.problems.push({
    ...s.problems[0],
    id: 'p2',
    templateId: 'water',
    seat: 19,
    hidden: true,
    revealed: false,
  });
  const overview = designShift(view(s, c, now));
  assert.match(overview, /aria-label="Все текущие проблемы и задачи"/);
  assert.ok(overview.indexOf('<h2>Проблемы') < overview.indexOf('<h2>Задачи'));
  for (const item of [...view(s, c, now).incidents, ...s.tasks].filter((x) => x.status === 'open'))
    assert.ok(overview.includes(item.label));
  assert.match(overview, /data-work-card="inspect"/);
  s = inspect(s);
  const r = view(s, c, now),
    html = designShift(r);
  assert.match(html, /Найдено проблем: 1/);
  assert.match(html, /Закончить осмотр без решения/);
  assert.doesNotMatch(html, /aria-label="Все текущие проблемы и задачи"/);
  assert.deepEqual(
    r.actions.filter((a) => a.command === 'focus').map((a) => a.incidentId),
    ['p2']
  );
  assert.doesNotMatch(html, /1 ход|data-game-pane="tasks"|data-game-tab="tasks"/);
});
test('card keeps its selected outcome and related new obligations; unrelated expiry stays in the log', () => {
  let s = choose(fixture('blanket'), 'bring');
  let html = designShift(view(s, c, now));
  const response = html.split('aria-label="Результат действия"')[1].split('</section>')[0];
  assert.ok(response.includes(s.problems[0].outcome));
  assert.match(response, /Дальнейшие задачи/);
  assert.match(response, /Принести плед/);
  assert.doesNotMatch(response, /Принять вагон/);
  assert.ok(s.acknowledgement.events.some((e) => e.type === 'task_failed' && e.taskId === 't1'));
  const cleared = act(s, { type: 'continue' });
  const overview = designShift(view(cleared, c, now));
  assert.doesNotMatch(overview, /aria-label="Результат действия"/);
  const overviewScene = overview
    .split('data-game-pane="scene"')[1]
    .split('data-game-pane="map"')[0];
  assert.doesNotMatch(overviewScene, /Принять вагон/);
  assert.ok(!overviewScene.includes(s.problems[0].outcome));
  assert.doesNotMatch(response, /<details|<dialog/);
  const other = choose(fixture('blanket'), 'dismiss');
  assert.notEqual(other.problems[0].outcome, s.problems[0].outcome);
  assert.ok(!other.tasks.some((t) => t.templateId === 'bring-blanket'));
  assert.notEqual(other.scales.loyalty, s.scales.loyalty);
});
test('drink preparation has a concrete effect on the tea choice; expired preparation cannot be completed', () => {
  let s = fixture('tea');
  s = act(s, { type: 'task', taskId: 't1' });
  s = act(s, { type: 'task', taskId: 't2' });
  s = act(s, { type: 'focus', incidentId: 'p1' });
  assert.equal(view(s, c, now).actions.find((a) => a.actionId === 'serve-now').available, true);
  assert.match(s.tasks[1].label, /напитков/);
  assert.match(s.tasks[1].outcome, /тележка/);
  let missed = fixture('tea');
  for (let i = 0; i < 4; i++) missed = inspect(missed);
  assert.equal(missed.tasks[1].status, 'failed');
  assert.throws(() => act(missed, { type: 'task', taskId: 't2' }), {
    code: 'ACTION_NOT_AVAILABLE',
  });
});
test('critical timeout and final turn close due obligations without duplicate effects', () => {
  let s = fixture('medical');
  s = act(s, { type: 'focus', incidentId: 'p1' });
  s = expire(s, c, now + 60000);
  assert.equal(s.step, 1);
  assert.equal(s.tasks[0].status, 'failed');
  assert.equal(s.log.filter((e) => e.type === 'task_failed' && e.taskId === 't1').length, 1);
  let last = fixture('blanket');
  last.step = last.totalTurns - 1;
  last = choose(last, 'bring');
  assert.equal(last.phase, 'result');
  assert.ok(last.tasks.every((t) => t.status !== 'open'));
  assert.equal(
    last.log.filter((e) => e.type === 'task_failed' && e.title === 'Принести плед').length,
    1
  );
});
test('task deadlines and card results survive reload and exact replay', (t) => {
  const h = harness();
  t.after(() => h.store.close());
  h.start({ scenarioId: 'design002', variantId: 'orientation' });
  if (h.run.phase === 'briefing') h.act('begin');
  h.act('task');
  h.act('continue');
  h.act('task');
  h.act('continue');
  h.act('abort');
  assert.equal(h.v2.exactReplay(h.profile, h.run.id).verified, true);
  assert.deepEqual(h.v2.get(h.profile, h.run.id), h.run);
});

test('inspection and critical timeout keep their own reaction when tasks expire in the same transition', () => {
  const inspected = inspect(fixture('seat'));
  const inspection = designShift(view(inspected, c, now))
    .split('aria-label="Результат действия"')[1]
    .split('</section>')[0];
  assert.match(inspection, /Осмотр завершён/);
  assert.equal(inspected.acknowledgement.title, 'Осмотр вагона');
  assert.ok(
    inspected.acknowledgement.events.some((e) => e.type === 'task_failed' && e.taskId === 't1')
  );
  let timed = fixture('medical');
  timed = act(timed, { type: 'focus', incidentId: 'p1' });
  timed = expire(timed, c, now + 60000);
  const reaction = designShift(view(timed, c, now))
    .split('aria-label="Результат действия"')[1]
    .split('</section>')[0];
  assert.ok(reaction.includes(timed.problems[0].outcome));
  assert.equal(timed.acknowledgement.type, 'critical_timeout');
  assert.equal(timed.acknowledgement.title, 'Пассажиру стало плохо');
  assert.ok(
    timed.acknowledgement.events.some((e) => e.type === 'task_failed' && e.taskId === 't1')
  );
});

test('finishing an inspection records its actual completion instead of a stale invitation to solve it', () => {
  let s = fixture('water');
  s.problems[0].hidden = true;
  s.problems[0].revealed = false;
  s = inspect(s);
  s = act(s, { type: 'continue' });
  const reaction = designShift(view(s, c, now))
    .split('aria-label="Результат действия"')[1]
    .split('</section>')[0];
  assert.match(reaction, /Осмотр завершён без немедленного решения/);
  assert.doesNotMatch(reaction, /Одно можно решить/);
  assert.equal(s.step, 1);
});
