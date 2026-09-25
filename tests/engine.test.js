import test from 'node:test';
import assert from 'node:assert/strict';
import { scenarios } from '../backend/catalog.js';
import {
  validateScenario,
  createState,
  decide,
  advance,
  summarize,
  rewind,
  publicState,
  available,
} from '../backend/engine.js';

for (const scenario of scenarios) {
  test(
    scenario.id + ': все доступные пути конечны, границы шкал и критический запрет сохраняются',
    () => {
      let endings = 0;
      let best = 0;
      function walk(state) {
        assert.ok(state.history.length <= 12);
        if (state.finished) {
          const result = summarize(state, scenario);
          endings++;
          if (state.criticalError) assert.equal(result.passed, false);
          assert.ok(result.safety >= 0 && result.safety <= 100);
          assert.ok(result.loyalty >= 0 && result.loyalty <= 100);
          best = Math.max(best, result.passed ? result.points : 0);
          return;
        }
        const node = scenario.nodes[state.nodeId];
        for (const o of node.options.filter((o) => available(state, o))) {
          const next = decide(state, scenario, o.id, state.enteredAt + 1000);
          walk(next.finished ? next : advance(next, scenario, state.enteredAt + 1500));
        }
        if (node.timer) {
          const next = decide(state, scenario, null, state.deadline);
          walk(next.finished ? next : advance(next, scenario, state.deadline + 500));
        }
      }
      walk(createState(scenario, 1000));
      assert.ok(endings > 5);
      assert.ok(best >= 250);
    }
  );
}
test('схема отклоняет отсутствующий переход, цикл и недостижимую сцену', () => {
  const a = structuredClone(scenarios[0]);
  a.nodes.start.options[0].next = 'missing';
  assert.throws(() => validateScenario(a));
  const b = structuredClone(scenarios[0]);
  b.nodes.start.options[0].next = 'start';
  assert.throws(() => validateScenario(b));
  const c = structuredClone(scenarios[0]);
  c.nodes.unreachable = { kind: 'ending', title: 'x', text: 'x' };
  assert.throws(() => validateScenario(c));
});
test('серверный дедлайн: ранний null запрещён; на самой границе действует таймаут', () => {
  const s = scenarios[1];
  const state = createState(s, 1000);
  assert.throws(() => decide(state, s, null, 1001), /Время ещё/);
  const next = decide(state, s, 'call', state.deadline);
  assert.equal(next.history[0].timedOut, true);
  assert.equal(next.criticalError, true);
  assert.equal(state.history.length, 0);
});
test('обратная связь не запускает следующий таймер, продолжение запускает ровно один раз', () => {
  const s = scenarios[1];
  let state = decide(createState(s, 1000), s, 'call', 1500);
  assert.equal(state.deadline, null);
  state = advance(state, s, 8000);
  assert.equal(state.deadline, 28000);
  assert.throws(() => advance(state, s, 9000));
});
test('условный вариант скрывает ключ оценивания и не может быть выбран без проверки', () => {
  const s = scenarios[3];
  let state = createState(s, 0);
  for (const id of ['acknowledge', 'catalog']) {
    state = decide(state, s, id, 100);
    state = advance(state, s, 100);
  }
  assert.throws(() => decide(state, s, 'consent', 101), /Сначала/);
  const view = publicState(state, s, 'test', 100);
  assert.equal(view.node.options.find((o) => o.id === 'consent').available, false);
  assert.equal(view.node.options[0].impact, undefined);
  assert.equal(view.node.options[0].next, undefined);
});
test('переигрывание — практика, но префикс решений и последствия сохранены', () => {
  const s = scenarios[0];
  let state = createState(s, 1000);
  for (const id of ['listen', 'resolve', 'verified', 'confirm', 'follow']) {
    state = decide(state, s, id, state.enteredAt + 100);
    if (!state.finished) state = advance(state, s, state.enteredAt + 200);
  }
  assert.equal(state.finished, true);
  const replay = rewind(state, s, 3, 9000);
  assert.equal(replay.practice, true);
  assert.equal(replay.nodeId, 'offer');
  assert.equal(replay.history.length, 3);
});
