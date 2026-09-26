/** Documentation-only checker. Does not import or test the production game engine. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const input = process.argv[2] || fileURLToPath(new URL('./shift-v2-contract.json', import.meta.url));
const fixture = JSON.parse(readFileSync(input, 'utf8'));
let groups = 0;
function check(name, test) {
  test();
  groups += 1;
  console.log(`OK ${groups}: ${name}`);
}
const s = fixture.serverCheckpoint;
const p = fixture.publicCheckpoint;
const clamp = (n) => Math.max(0, Math.min(100, n));

check('fixture and state discriminators', () => {
  assert.equal(fixture.fixtureVersion, 'issue21-1');
  assert.equal(s.schemaVersion, 2);
  assert.equal(s.engineVersion, 'shift-2');
  assert.equal(s.phase, 'feedback');
  assert.equal(s.stage, 'service');
  assert.equal(s.step, 2);
  assert(s.revision > s.step);
  assert.equal(s.criticalWindow, null);
  assert.equal(s.variantSelection.seed, null);
  assert.equal(s.inspection.status, 'passed');
});
check('references and independent incident states', () => {
  assert.equal(Object.keys(s.incidents).length, 2);
  for (const i of Object.values(s.incidents)) {
    for (const id of i.actorIds) assert(s.actors[id], `unknown actor ${id}`);
    assert(['open', 'waiting', 'resolved', 'failed'].includes(i.status));
    assert(['hidden', 'revealed'].includes(i.discovery));
  }
  assert.equal(s.incidents[s.focusIncidentId].discovery, 'revealed');
  for (const c of Object.values(s.commitments)) {
    assert(s.incidents[c.incidentId]);
    assert(s.actors[c.actorId]);
    assert(c.dueStep > s.step);
  }
  assert.equal(s.commitments['return-p1'].actorId, 'p1');
});
check('public checkpoint matches known world without hidden identifiers', () => {
  for (const key of ['id', 'revision', 'step', 'phase', 'stage', 'mode', 'status']) {
    assert.equal(p[key], s[key]);
  }
  assert.deepEqual(p.scales, s.scales);
  assert.deepEqual(p.incidents.map((i) => i.id), ['a-seat']);
  const serialized = JSON.stringify(p);
  for (const forbidden of ['b-aisle', 'p3', 'scheduledEvents', 'flags', 'criteria', 'variantId', 'seed', 'guard', 'recommended', 'profileId']) {
    assert(!serialized.includes(`"${forbidden}"`), `public leak: ${forbidden}`);
  }
  for (const actor of p.actors) assert.equal(s.actors[actor.id].revealed, true);
});
check('fixed criterion opportunities and evidence', () => {
  assert.equal(s.criteria.length, 7);
  assert.equal(new Set(s.criteria.map((c) => c.id)).size, 7);
  for (const c of s.criteria) {
    assert.equal(c.possible, 1);
    assert([0, 1].includes(c.earned));
    assert.equal(c.status, 'assessed');
    if (c.earned) assert(c.evidenceEventIds.length > 0);
  }
});
check('command IDs and optimistic revisions', () => {
  assert.equal(fixture.commandExamples.length, 2);
  const seen = new Set();
  for (const {path, body} of fixture.commandExamples) {
    assert.equal(path, `/api/v2/runs/${s.id}/commands`);
    assert(/^[a-zA-Z0-9-]{8,64}$/.test(body.requestId));
    assert(!seen.has(body.requestId));
    seen.add(body.requestId);
    assert(Number.isInteger(body.revision));
    assert.deepEqual(Object.keys(body).sort(), ['command', 'requestId', 'revision']);
  }
  assert.equal(fixture.commandExamples[0].body.revision, s.revision);
  assert.equal(fixture.commandExamples[1].body.revision, s.revision + 1);
});
check('deadline boundary is inclusive, using documented server timestamps', () => {
  const b = fixture.criticalBoundary;
  assert.equal(b.deadline - b.openedAt, b.durationMs);
  assert.equal(new Date(b.openedAt).toISOString(), '2026-09-26T12:00:00.000Z');
  assert.deepEqual(b.cases.map((c) => c.acceptedAt - b.deadline), [-1, 0, 1]);
  for (const c of b.cases) assert.equal(c.acceptedAt >= b.deadline ? 'timeout' : 'choice', c.expected);
});
check('scheduled events have stable order and future due steps', () => {
  const events = fixture.sameStepOrder;
  const ordered = [...events].sort((a, b) => a.dueStep - b.dueStep || a.priority - b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  assert.deepEqual(events, ordered);
  assert.equal(events[0].id, 'a-ack');
  assert.equal(events[1].id, 'b-escalate');
  for (const e of s.scheduledEvents) assert(e.dueStep > s.step);
});
check('all four authored traces have consistent scale arithmetic and unique criteria', () => {
  assert.equal(fixture.traces.length, 4);
  const criteria = new Set(s.criteria.map((c) => c.id));
  for (const trace of fixture.traces) {
    let {loyalty, safety} = trace.initialScales;
    const earned = new Set();
    const errors = [];
    trace.steps.forEach((row, i) => {
      assert.equal(row.step, i + 1);
      assert(row.step <= s.maxSteps);
      assert(row.delta.length === 2 && row.delta.every(Number.isFinite));
      loyalty = clamp(loyalty + row.delta[0]);
      safety = clamp(safety + row.delta[1]);
      for (const id of row.criteria) {
        assert(criteria.has(id));
        assert(!earned.has(id), `${trace.id}: repeated criterion ${id}`);
        earned.add(id);
      }
      if (row.criticalError) errors.push(row.criticalError);
    });
    assert.equal(loyalty, trace.expected.loyalty);
    assert.equal(safety, trace.expected.safety);
    assert.equal(earned.size * 10, trace.expected.episodePoints);
    assert.deepEqual(errors, trace.expected.criticalErrors);
    const e = trace.expected;
    const passed = errors.length === 0 && safety >= 65 && loyalty >= 55 && e.inspection === 'passed' && e.a === 'resolved' && e.b === 'resolved' && e.commitment === 'fulfilled';
    assert.equal(passed, e.passed);
  }
});
check('handoff acknowledgment is not incident completion in any trace', () => {
  for (const trace of fixture.traces) {
    const ack = trace.steps.find((row) => row.automaticEvents?.includes('a-ack-accepted'));
    assert(ack);
    assert.equal(ack.aStatusAfter, 'waiting');
    const complete = trace.steps.find((row) => row.action === 'confirm-and-return-p1');
    assert(complete.step > ack.step);
    assert(complete.step <= s.commitments['return-p1'].dueStep);
    assert.equal(trace.expected.handoff, 'completed');
  }
});
check('early resolution and same-step return are represented by guard skips', () => {
  const good = fixture.traces.find((t) => t.id === 'early-discovery-success');
  assert(good.steps[3].automaticEvents.includes('b-escalate-skipped-terminal'));
  assert(good.steps[6].automaticEvents.includes('return-due-skipped-fulfilled'));
  assert.equal(good.steps[6].step, s.commitments['return-p1'].dueStep);
  const timeout = fixture.traces.find((t) => t.id === 'critical-timeout');
  assert.equal(timeout.steps.filter((r) => r.action === 'timeout').length, 1);
});
console.log(`PASS: ${groups} documentation consistency groups; production engine/API/UI not tested.`);
