import test from 'node:test';
import assert from 'node:assert/strict';
import { scenarios } from '../backend/catalog.js';
import { createState, decide, advance, available, summarize } from '../backend/engine.js';
import {
  SHIFT_CONTENT,
  PREVIOUS_SHIFT_CONTENT,
  LEGACY_SHIFT_CONTENT,
  contentHash,
  validateShiftContent,
} from '../backend/shift-content.js';
import { publishShiftContent } from '../backend/shift-service.js';
import { harness } from './shift-helper.js';
const scenario = (id) => scenarios.find((s) => s.id === id);
const option = (id, n, o) => scenario(id).nodes[n].options.find((v) => v.id === o);
for (const s of scenarios)
  test(`content audit: all executable paths/options/timeouts ${s.id}`, () => {
    const seen = new Set(),
      choices = new Set();
    let endings = 0;
    function visit(state, depth = 0) {
      assert.ok(depth < 20, 'finite scenario');
      seen.add(state.nodeId);
      if (state.finished) {
        const r = summarize(state, s);
        assert.ok(r.ending.text.trim());
        if (state.criticalError) assert.equal(r.passed, false);
        endings++;
        return;
      }
      const n = s.nodes[state.nodeId],
        list = n.options.filter((o) => available(state, o));
      assert.ok(list.length > 0, 'no choice deadlock');
      for (const o of [...list, ...(n.timer ? [null] : [])]) {
        choices.add(`${state.nodeId}/${o?.id || 'timeout'}`);
        const at = o ? state.enteredAt + 1 : state.deadline;
        const next = decide(state, s, o?.id ?? null, at);
        assert.ok(next.history.at(-1).feedback.trim());
        visit(next.finished ? next : advance(next, s, at + 1), depth + 1);
      }
    }
    visit(createState(s, 0));
    assert.deepEqual([...seen].sort(), Object.keys(s.nodes).sort());
    for (const [id, n] of Object.entries(s.nodes))
      for (const o of n.options || [])
        assert.ok(choices.has(`${id}/${o.id}`), `reachable ${id}/${o.id}`);
    console.log(
      `AUDIT ${s.id}: ${seen.size} nodes, ${choices.size} choices incl. timeouts, ${endings} complete paths`
    );
  });
test('late medical help cannot be described as timely after later scale recovery', () => {
  const s = scenario('medical');
  let state = createState(s, 0);
  for (const id of ['wait', 'urgent', 'facts', 'protocol', 'privacy']) {
    state = decide(state, s, id, state.enteredAt + 1);
    if (!state.finished) state = advance(state, s, state.enteredAt + 2);
  }
  assert.equal(state.nodeId, 'mixed');
  assert.equal(summarize(state, s).passed, false);
});
test('unconfirmed service order timeout does not invent a charge or refund', () => {
  const s = scenario('service');
  let state = createState(s, 0);
  for (const id of ['acknowledge', 'catalog', 'ask']) {
    state = decide(state, s, id, state.enteredAt + 1);
    state = advance(state, s, state.enteredAt + 2);
  }
  assert.equal(state.nodeId, 'clarify');
  state = decide(state, s, null, state.deadline);
  assert.equal(state.nodeId, 'mixed');
  assert.match(state.history.at(-1).feedback, /списания не было/);
});
test('rechecking service availability records both consent and stock', () => {
  assert.deepEqual(option('service', 'clarify', 'confirm').set, { consent: true, stock: true });
});
test('delay silence does not invent an earlier promise', () => {
  const s = scenario('delay');
  let state = createState(s, 0);
  state = decide(state, s, 'ignore', 1);
  assert.equal(state.nodeId, 'uncertain');
  assert.doesNotMatch(s.nodes.uncertain.text, /Обещанное время/);
});
test('safe baggage completion includes correcting an obstruction at the door', () => {
  assert.match(option('baggage', 'check', 'clear').title, /переставить/);
  assert.match(option('baggage', 'check', 'clear').feedback, /препятствие устранено/);
});
test('published content keeps prior hash, rejects tampering, and increments every catalog version', () => {
  assert.equal(
    contentHash(PREVIOUS_SHIFT_CONTENT),
    'df8bf471cb4690353ec7fa6d77a88006cdfb5451214041fa50420f0f3682fde6'
  );
  for (const c of [LEGACY_SHIFT_CONTENT, PREVIOUS_SHIFT_CONTENT, SHIFT_CONTENT])
    assert.deepEqual(validateShiftContent(c), []);
  assert.equal(SHIFT_CONTENT.version, 'shift-content-3');
  assert.ok(scenarios.every((s) => s.version === '2.0.1'));
  const invalid = structuredClone(SHIFT_CONTENT);
  invalid.dialogue.labels.acknowledge = 'unreviewed';
  assert.ok(validateShiftContent(invalid).length);
});
test('a run pinned to publication 2 completes and replays after publication 3 is selected', () => {
  const h = harness();
  try {
    publishShiftContent(h.store, PREVIOUS_SHIFT_CONTENT, h.now + 1);
    h.start();
    assert.equal(h.run.contentVersion, 'shift-content-2');
    h.store.run(
      'UPDATE shift_publications SET enabled=0 WHERE content_version=?',
      PREVIOUS_SHIFT_CONTENT.version
    );
    assert.equal(h.v2.currentContent().version, 'shift-content-3');
    assert.equal(h.early().passed, true);
    assert.equal(h.v2.exactReplay(h.profile, h.run.id).verified, true);
  } finally {
    h.store.close();
  }
});
