import test from 'node:test';
import assert from 'node:assert/strict';
import { DESIGN002_CONTENT as content, validateDesign002 } from '../backend/design002-content.js';
import {
  createDesignShift,
  reduceDesignShift,
  publicDesignShift,
} from '../backend/design002-engine.js';
import { commandFor } from '../src/shift-view.js';
const now = 1800000000000;
function paths(problem, choices = problem.choices, trail = [], visited = new Set()) {
  return choices.flatMap((option) => {
    const path = [...trail, option];
    if (!option.dialogue) return [path];
    assert.ok(!visited.has(option.dialogue), `${problem.id} has a non-terminating conversation`);
    assert.equal(option.points, null);
    for (const key of ['tasks', 'next', 'loyalty', 'safety', 'failShiftImmediately'])
      assert.equal(
        option[key],
        undefined,
        `${problem.id}: effects applied before conversation ends`
      );
    const node = problem.dialogue[option.dialogue];
    assert.ok(
      node?.text && node.choices.length >= 2,
      `${problem.id}: missing meaningful follow-up`
    );
    return paths(problem, node.choices, path, new Set([...visited, option.dialogue]));
  });
}
test('all authored problems have multi-stage normal routes with distinct intermediate reactions and outcomes', () => {
  assert.deepEqual(validateDesign002(content), []);
  for (const p of Object.values(content.problems)) {
    const routes = paths(p);
    const good = routes.filter((route) => route.at(-1).points === 2);
    assert.ok(good.length > 0, `${p.id}: no successful route`);
    assert.ok(
      good.every((route) => route.length >= 2),
      `${p.id}: instant successful resolution`
    );
    assert.ok(
      routes.some((route) => route.at(-1).points === 0),
      `${p.id}: no consequential alternative`
    );
    for (const option of p.choices.filter((o) => o.dialogue)) {
      const outcomes = paths(p, p.dialogue[option.dialogue].choices).map((route) => route.at(-1));
      assert.ok(
        new Set(outcomes.map((o) => o.points)).size >= 2,
        `${p.id}: follow-up is only confirmation`
      );
    }
    if (!['medical', 'smoke'].includes(p.id)) {
      const openings = p.choices.filter((o) => o.dialogue);
      assert.ok(openings.length >= 2, `${p.id}: no distinct conversation approaches`);
      assert.equal(new Set(openings.map((o) => o.text)).size, openings.length);
    }
  }
});
test('every authored conversation route executes with no early effects, one completed action and an in-card result', () => {
  for (const p of Object.values(content.problems))
    for (const route of paths(p)) {
      let state = createDesignShift(
        content,
        {
          id: `conversation-${p.id}`,
          profileId: 'test',
          mode: 'training',
          serviceClass: 'standard',
          timingPolicyId: 'standard',
          variantId: 'full',
        },
        now
      );
      state = reduceDesignShift(state, { type: 'begin' }, content, now);
      state.problems = [
        {
          id: 'p1',
          templateId: p.id,
          seat: 18,
          at: 0,
          appearedTurn: 0,
          expiresTurn: 100,
          hidden: false,
          revealed: true,
          status: 'active',
          node: 'start',
          startedAt: null,
          appearanceOrder: 1,
          knownOrder: 1,
        },
      ];
      state.tasks = [];
      state.flags.served = true;
      state = reduceDesignShift(state, { type: 'focus', incidentId: 'p1' }, content, now);
      const before = structuredClone(state.passengers);
      for (const [i, option] of route.entries()) {
        const action = publicDesignShift(state, content, now).actions.find(
          (a) => a.command === 'choose' && a.actionId === option.id
        );
        assert.ok(action, `${p.id}/${option.id} missing`);
        state = reduceDesignShift(state, commandFor(action), content, now);
        if (i < route.length - 1) {
          assert.equal(state.step, 0, p.id);
          assert.equal(state.problems[0].status, 'active', p.id);
          assert.deepEqual(state.passengers, before, p.id);
          assert.equal(state.tasks.length, 0, p.id);
        }
      }
      assert.equal(state.step, 1, p.id);
      assert.equal(state.problems[0].points, route.at(-1).points, p.id);
      assert.equal(state.acknowledgement.incidentId, 'p1', p.id);
      assert.equal(state.acknowledgement.text, route.at(-1).text, p.id);
      assert.deepEqual(
        publicDesignShift(state, content, now).actions.map((a) => a.command),
        ['continue'],
        p.id
      );
    }
});
