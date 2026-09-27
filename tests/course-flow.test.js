import test from 'node:test';
import assert from 'node:assert/strict';
import { courseLessons, lessonPassed } from '../src/course.js';
import { renderShift } from '../src/shift-view.js';
import { wagonMap } from '../src/wagon-view.js';
const catalog = {
  classes: ['standard', 'comfort', 'business', 'first'].map((id) => ({ id, label: id })),
  trainingVariants: [
    { id: 'blocked-aisle', label: 'Проход' },
    { id: 'clear-aisle-service-check', label: 'Памятка' },
  ],
};
test('course covers both forms in four classes and progresses from untimed practice to assessment', () => {
  const lessons = courseLessons(catalog);
  assert.equal(lessons.length, 8);
  assert.equal(new Set(lessons.map((l) => l.id)).size, 8);
  assert.equal(lessons[0].timingPolicyId, 'untimed');
  assert.equal(lessons[2].timingPolicyId, 'extended');
  assert.equal(lessons[4].timingPolicyId, 'standard');
  assert.equal(lessons[6].mode, 'assessment');
  const result = { ...lessons[0], passed: true };
  assert.equal(lessonPassed(lessons[0], [result]), true);
  for (const patch of [
    { passed: false },
    { serviceClass: 'first' },
    { timingPolicyId: 'standard' },
    { origin: { runId: 'other' } },
    { mode: 'assessment' },
  ])
    assert.equal(lessonPassed(lessons[0], [{ ...result, ...patch }]), false);
});
const run = {
  schemaVersion: 2,
  phase: 'overview',
  stage: 'service',
  mode: 'training',
  context: { serviceClass: 'standard' },
  incidents: [{ id: 'a-seat', label: 'Обращение', status: 'open' }],
  actions: [
    { command: 'focus', incidentId: 'a-seat', label: 'Подойти' },
    { command: 'wait', label: 'Ждать' },
    { command: 'inspect', label: 'Осмотреть', durationSeconds: 60 },
  ],
  tasks: [],
  observations: [],
};
test('known work exposes focus in the scene and never reintroduces wait through fallback', () => {
  const html = renderShift(run);
  const scene = html.split('data-game-pane="scene">')[1].split('<section class="game-pane"')[0];
  assert.match(scene, /Подойти/);
  assert.match(scene, /Осмотреть/);
  assert.doesNotMatch(scene, /Ждать/);
  const awaiting = {
    ...run,
    incidents: [{ ...run.incidents[0], status: 'waiting', handoffStatus: 'accepted' }],
  };
  assert.match(
    renderShift(awaiting)
      .split('data-game-pane="scene">')[1]
      .split('<section class="game-pane"')[0],
    /Ждать/
  );
});
test('map reveals only server-known incidents, changes class layout and reflects resolved status', () => {
  const html = wagonMap(run);
  assert.match(html, /data-focus-incident="a-seat"/);
  assert.doesNotMatch(html, /b-aisle/);
  assert.match(html, /3 плюс 2/);
  const done = wagonMap({
    ...run,
    context: { serviceClass: 'first' },
    incidents: [{ ...run.incidents[0], status: 'resolved' }],
    actions: [],
  });
  assert.match(done, /2 плюс 1/);
  assert.match(done, /Решено/);
  assert.doesNotMatch(done, /data-focus-incident/);
});
