import test from 'node:test';
import assert from 'node:assert/strict';
import { DESIGN002_CONTENT as c, validateDesign002 } from '../backend/design002-content.js';
import {
  createDesignShift,
  reduceDesignShift,
  publicDesignShift,
} from '../backend/design002-engine.js';
import { commandFor } from '../src/shift-view.js';
const now = 1800000000000;
function fixture(templateId) {
  let s = createDesignShift(
    c,
    {
      id: 'audit-' + templateId,
      profileId: 'synthetic-audit',
      mode: 'training',
      serviceClass: 'standard',
      timingPolicyId: 'standard',
      variantId: 'full',
    },
    now
  );
  s = reduceDesignShift(s, { type: 'begin' }, c, now);
  s.problems = [
    {
      id: 'p1',
      templateId,
      seat: 18,
      at: 0,
      appearedTurn: 0,
      expiresTurn: 8,
      hidden: false,
      revealed: true,
      status: 'active',
      node: 'start',
      startedAt: null,
      appearanceOrder: 1,
      knownOrder: 1,
    },
  ];
  s.tasks = [];
  s.flags.served = true;
  s.passengers = [
    { id: 'p18', seat: 18, loyalty: 75 },
    { id: 'p19', seat: 19, loyalty: 75 },
  ];
  s.log = [];
  s.lastEventSeq = 0;
  return reduceDesignShift(s, { type: 'focus', incidentId: 'p1' }, c, now);
}
for (const p of Object.values(c.problems))
  test(`Design002 authored outcomes: ${p.id}`, () => {
    const seen = new Set();
    let terminal = 0;
    function visit(s, node = 'start', depth = 0) {
      assert.ok(depth < 5, 'bounded dialogue');
      const scene = node === 'start' ? p : p.dialogue[node];
      assert.ok(scene.text.trim());
      const choices = publicDesignShift(s, c, now).actions.filter(
        (a) => a.command === 'choose' && a.available !== false
      );
      assert.equal(
        choices.length,
        scene.choices.length,
        'all authored choices covered with prerequisite satisfied'
      );
      for (const a of choices) {
        const o = scene.choices.find((o) => o.id === a.actionId);
        assert.ok(o.label.trim() && o.text.trim());
        seen.add(node + '/' + o.id);
        const next = reduceDesignShift(s, commandFor(a), c, now);
        if (o.dialogue) {
          assert.equal(next.step, 0);
          visit(next, o.dialogue, depth + 1);
        } else {
          assert.equal(next.step, 1);
          assert.equal(next.problems.find((x) => x.id === 'p1').points, o.points);
          if (p.debriefAlternative) {
            const done =
              next.phase === 'result' ? next : reduceDesignShift(next, { type: 'abort' }, c, now);
            assert.equal(
              done.result.problems.find((x) => x.id === 'p1').alternative,
              p.debriefAlternative
            );
          }
          terminal++;
        }
      }
    }
    visit(fixture(p.id));
    assert.ok(terminal >= 2);
    assert.ok(p.worst.text.trim());
    assert.equal(
      seen.size,
      p.choices.length + Object.values(p.dialogue || {}).reduce((n, d) => n + d.choices.length, 0)
    );
  });
