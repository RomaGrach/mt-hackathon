import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, makeDecision, getNode, summarizeRun, rewindToDecision } from '../src/game.js';

test('решение меняет показатели и ведёт к выбранной ветке', () => {
  const run = createRun('conflict');
  const next = makeDecision(run, 'listen', 12);
  assert.equal(next.nodeId, 'calm');
  assert.equal(next.loyalty, 82);
  assert.equal(next.safety, 80);
  assert.equal(next.points, 120);
  assert.equal(next.history[0].secondsLeft, 12);
});

test('таймер выбирает предсказуемое последствие только на срочном шаге', () => {
  const run = createRun('medical');
  const next = makeDecision(run, null, 0);
  assert.equal(next.nodeId, 'delay');
  assert.equal(next.history[0].timedOut, true);
  assert.throws(() => makeDecision(createRun('conflict'), null, 0));
});

test('нажатие на границе таймера считается таймаутом', () => {
  const next = makeDecision(createRun('medical'), 'call', 0);
  assert.equal(next.nodeId, 'delay');
  assert.equal(next.history[0].timedOut, true);
});

test('показатели ограничены диапазоном 0–100, завершение даёт итог', () => {
  const capped = makeDecision({ ...createRun('conflict'), loyalty: 99, safety: 99 }, 'listen', 10);
  assert.equal(capped.loyalty, 100);
  assert.equal(capped.safety, 100);
  const first = makeDecision(createRun('conflict'), 'dismiss', 10);
  const finished = makeDecision(first, 'threaten', 8);
  assert.equal(finished.finished, true);
  assert.equal(getNode(finished).kind, 'ending');
  assert.equal(summarizeRun(finished).grade, 'Нужна практика');
  assert.throws(() => makeDecision(finished, 'listen', 1));
});

test('неизвестный вариант не меняет игру', () => {
  const run = createRun('conflict');
  assert.throws(() => makeDecision(run, 'missing', 10));
  assert.equal(run.history.length, 0);
});

test('критическая ошибка исключает успешный зачёт даже при высоких баллах', () => {
  const boosted = { ...createRun('medical'), loyalty: 100, safety: 100, points: 1000 };
  const delayed = makeDecision(boosted, 'wait', 9);
  const finished = makeDecision(delayed, 'urgent', 7);
  const result = summarizeRun(finished);
  assert.equal(result.criticalError, true);
  assert.equal(result.grade, 'Нужна практика');
  assert.equal(result.passed, false);
  assert.equal(result.scenarioVersion, 'demo-1');
});

test('можно переиграть последнюю развилку без повторения первого решения', () => {
  const first = makeDecision(createRun('conflict'), 'listen', 12);
  const finished = makeDecision(first, 'resolve', 10);
  const rewound = rewindToDecision(finished, 1);
  assert.equal(rewound.nodeId, 'calm');
  assert.equal(rewound.history.length, 1);
  assert.equal(rewound.points, 120);
  assert.equal(rewound.finished, false);
  assert.equal(makeDecision(rewound, 'move', 5).nodeId, 'mixed');
});
