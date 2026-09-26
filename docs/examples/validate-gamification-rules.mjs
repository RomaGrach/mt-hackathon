// Reference checks for docs/GAMIFICATION-RULES.md, gamification-1.
// Not production code: no database, HTTP, actual scenario or concurrency tests.
// Run: node docs/examples/validate-gamification-rules.mjs
import assert from 'node:assert/strict';

const period = {
  id: '2026-09-21',
  start: Date.parse('2026-09-20T21:00:00Z'),
  end: Date.parse('2026-09-27T21:00:00Z'),
};
const KEY = 'text-shift-demo|design-1|demo-rubric-1|blocked-aisle|standard:20000|shift-2|gamification-1';
const criteria = (earned = 7) => [{ id: 'example-total', status: 'assessed', earned, possible: 7 }];
let checks = 0;
function check(name, fn) {
  fn();
  checks++;
  console.log(`ok ${checks} - ${name}`);
}

// Use integer rubric units, not floating-point multiplication of a percentage.
function rubricScore(items) {
  assert.ok(Array.isArray(items) && items.length > 0, 'empty rubric');
  const ids = new Set();
  let earned = 0n;
  let possible = 0n;
  for (const c of items) {
    assert.ok(typeof c.id === 'string' && c.id && !ids.has(c.id), 'duplicate/missing criterion');
    ids.add(c.id);
    if (c.status === 'not_assessed') {
      assert.equal(c.earned, null);
      assert.equal(c.possible, null);
      continue;
    }
    assert.equal(c.status, 'assessed');
    assert.ok(Number.isSafeInteger(c.earned) && Number.isSafeInteger(c.possible));
    assert.ok(c.earned >= 0 && c.possible >= c.earned);
    earned += BigInt(c.earned);
    possible += BigInt(c.possible);
  }
  assert.ok(possible > 0n, 'zero denominator');
  return Number(100n * earned / possible);
}

function exampleResult(overrides = {}) {
  return {
    runId: 'run-1', ordinal: 1, consentAtBegin: true, reserved: true,
    completed: true, mode: 'assessment', origin: null, passed: true,
    criticalErrors: [], technicalIssue: false, hints: 0, pauses: 0,
    comparisonKey: KEY, acceptedAt: period.start + 1000, criteria: criteria(),
    ...overrides,
  };
}
function resultScore(r, expectedKey = KEY, w = period) {
  if (!r.consentAtBegin || !r.reserved || ![1, 2].includes(r.ordinal)
      || !r.completed || r.mode !== 'assessment' || r.origin !== null
      || !r.passed || r.criticalErrors.length > 0 || r.technicalIssue
      || r.hints !== 0 || r.pauses !== 0 || r.comparisonKey !== expectedKey
      || !Number.isFinite(r.acceptedAt) || r.acceptedAt < w.start || r.acceptedAt >= w.end) return 0;
  return rubricScore(r.criteria);
}
function slotScore(results) {
  const runs = new Set();
  const ordinals = new Set();
  let best = 0;
  for (const r of results) {
    if (runs.has(r.runId)) continue; // Re-delivery is not a new result.
    runs.add(r.runId);
    if (![1, 2].includes(r.ordinal)) continue; // Invalid third attempt earns nothing.
    assert.ok(!ordinals.has(r.ordinal), 'two live results for one ordinal');
    ordinals.add(r.ordinal);
    best = Math.max(best, resultScore(r));
  }
  return best;
}
function packScore(slots) {
  assert.ok(slots.length >= 1 && slots.length <= 3);
  return slots.reduce((sum, results) => sum + slotScore(results), 0);
}

// A pure, sequential reference for the reservation invariant; production needs a transaction.
function reserve(entry, runId) {
  if (entry.runs.has(runId)) return entry.runs.get(runId);
  assert.ok(entry.runs.size < 2, 'attempt limit');
  const ordinal = entry.runs.size + 1;
  entry.runs.set(runId, ordinal);
  return ordinal;
}

// Keys include profileId in production. This fixture represents one profile only.
class PracticeLedger {
  credits = new Map();
  acknowledged = new Set();
  lifetime = 0;
  acknowledge({ runId, week, family, full = true, useful = true, technical = false, aborted = false, replay = false }) {
    if (this.acknowledged.has(runId)) return 0;
    this.acknowledged.add(runId);
    if (!useful || technical || aborted || replay) return 0;
    let families = this.credits.get(week);
    if (!families) this.credits.set(week, families = new Map());
    if (!families.has(family) && families.size >= 5) return 0;
    const old = families.get(family) ?? 0;
    const next = Math.max(old, full ? 20 : 10);
    families.set(family, next);
    this.lifetime += next - old;
    return next - old;
  }
  get level() { return 1 + Math.floor(this.lifetime / 100); }
}

function rankRows(rows, { band, group }) {
  const visible = rows.filter((r) => r.optIn && r.score > 0 && r.band === band && r.group === group);
  if (visible.length < 5) return [];
  return visible.map((r) => ({ ...r, rank: 1 + visible.filter((v) => v.score > r.score).length }));
}
function bandFor(priorActivePeriods, returnTicket) {
  return priorActivePeriods < 2 ? 'starter' : returnTicket ? 'returning' : 'main';
}

check('7/7 => 100, 6/7 => 85, exact integer rounding', () => {
  assert.equal(resultScore(exampleResult()), 100);
  assert.equal(resultScore(exampleResult({ criteria: criteria(6) })), 85);
  assert.equal(rubricScore([{ id: 'fraction', status: 'assessed', earned: 29, possible: 50 }]), 58);
});
check('critical error cannot be offset by other criteria', () => {
  assert.equal(resultScore(exampleResult({ criticalErrors: ['unsafe_deferral'], criteria: criteria(5) })), 0);
});
check('failed, incomplete, technical, training and replay results are ineligible', () => {
  for (const change of [{ passed: false }, { completed: false }, { technicalIssue: true },
    { mode: 'training' }, { origin: { runId: 'old' } }, { hints: 1 }, { pauses: 1 },
    { consentAtBegin: false }, { reserved: false }]) {
    assert.equal(resultScore(exampleResult(change)), 0);
  }
});
check('different versions, variants and timing policies do not mix', () => {
  for (const key of [KEY.replace('standard:20000', 'untimed'), KEY.replace('design-1', 'design-2'),
    KEY.replace('blocked-aisle', 'another-variant')]) {
    assert.equal(resultScore(exampleResult({ comparisonKey: key })), 0);
  }
});
check('period is start-inclusive and end-exclusive', () => {
  for (const [acceptedAt, expected] of [[period.start - 1, 0], [period.start, 100],
    [period.end - 1, 100], [period.end, 0], [NaN, 0]]) {
    assert.equal(resultScore(exampleResult({ acceptedAt })), expected);
  }
  assert.equal(new Date('2026-09-28T00:00:00+03:00').getTime(), period.end);
});
check('85 then 100 gives only 15 additional SP', () => {
  const first = exampleResult({ criteria: criteria(6) });
  const second = exampleResult({ runId: 'run-2', ordinal: 2 });
  assert.equal(slotScore([first]), 85);
  assert.equal(slotScore([first, second]) - slotScore([first]), 15);
});
check('worse second result and duplicate delivery do not change the best score', () => {
  const first = exampleResult();
  assert.equal(slotScore([first, first, exampleResult({ runId: 'run-2', ordinal: 2, passed: false })]), 100);
});
check('third attempt and fifty training repetitions cannot farm SP', () => {
  const first = exampleResult({ passed: false });
  const second = exampleResult({ runId: 'run-2', ordinal: 2, passed: false });
  assert.equal(slotScore([first, second, exampleResult({ runId: 'run-3', ordinal: 3 })]), 0);
  for (let i = 0; i < 50; i++) assert.equal(resultScore(exampleResult({ mode: 'training' })), 0);
});
check('reservation survives repeated begin; aborted attempts are not removed', () => {
  const entry = { runs: new Map() };
  assert.equal(reserve(entry, 'aborted-1'), 1);
  assert.equal(reserve(entry, 'aborted-1'), 1);
  assert.equal(reserve(entry, 'timeout-2'), 2);
  assert.throws(() => reserve(entry, 'new-3'));
});
check('one or three slots cap at 100 or 300; invalid pack size fails', () => {
  assert.equal(packScore([[exampleResult()]]), 100);
  assert.equal(packScore([[exampleResult()], [exampleResult()], [exampleResult()]]), 300);
  assert.throws(() => packScore([]));
  assert.throws(() => packScore([[], [], [], []]));
});
check('invalid and duplicate rubric entries fail instead of producing a fictitious score', () => {
  for (const [earned, possible] of [[0, 0], [8, 7], [-1, 7], [NaN, 7], [1.5, 7]]) {
    assert.throws(() => rubricScore([{ id: 'x', status: 'assessed', earned, possible }]));
  }
  assert.throws(() => rubricScore([...criteria(), ...criteria()]));
  assert.equal(rubricScore([...criteria(), { id: 'time', status: 'not_assessed', earned: null, possible: null }]), 100);
  assert.throws(() => rubricScore([{ id: 'time', status: 'not_assessed', earned: null, possible: null }]));
});
check('partial + full practice gives 10 + 10, not 10 + 20', () => {
  const l = new PracticeLedger();
  assert.equal(l.acknowledge({ runId: 'partial', week: 'w1', family: 'a', full: false }), 10);
  assert.equal(l.acknowledge({ runId: 'full', week: 'w1', family: 'a' }), 10);
  assert.equal(l.acknowledge({ runId: 'again', week: 'w1', family: 'a' }), 0);
  assert.equal(l.lifetime, 20);
});
check('five-family weekly XP limit also allows upgrading an existing family', () => {
  const l = new PracticeLedger();
  for (let i = 0; i < 5; i++) l.acknowledge({ runId: `partial-${i}`, week: 'w1', family: `f${i}`, full: false });
  assert.equal(l.acknowledge({ runId: 'sixth', week: 'w1', family: 'f5' }), 0);
  for (let i = 0; i < 5; i++) l.acknowledge({ runId: `full-${i}`, week: 'w1', family: `f${i}` });
  assert.equal(l.lifetime, 100);
  assert.equal(l.level, 2);
});
check('debrief ack is unique across request keys and future weeks', () => {
  const l = new PracticeLedger();
  const x = { runId: 'one-run', week: 'w1', family: 'a' };
  assert.equal(l.acknowledge(x), 20);
  assert.equal(l.acknowledge(x), 0);
  assert.equal(l.acknowledge({ ...x, week: 'w2' }), 0);
  assert.equal(l.acknowledge({ ...x, runId: 'new-run', week: 'w2' }), 20);
});
check('technical, aborted and exact replay attempts earn no practice XP', () => {
  for (const flag of ['technical', 'aborted', 'replay']) {
    const l = new PracticeLedger();
    assert.equal(l.acknowledge({ runId: flag, week: 'w1', family: 'a', [flag]: true }), 0);
  }
  const l = new PracticeLedger();
  // Useful failed practice is not given a quality multiplier, and earns the same capped XP.
  assert.equal(l.acknowledge({ runId: 'failed-with-debrief', week: 'w1', family: 'a' }), 20);
});
check('new week does not deduct lifetime XP or a previously reached level', () => {
  const l = new PracticeLedger();
  for (let i = 0; i < 5; i++) l.acknowledge({ runId: `r${i}`, week: 'w1', family: `f${i}` });
  assert.equal(l.lifetime, 100);
  l.acknowledge({ runId: 'after-pause', week: 'w9', family: 'f0' });
  assert.equal(l.lifetime, 120);
  assert.equal(l.level, 2);
  assert.equal(packScore([[]]), 0);
});
check('shared ranks, opt-out and small incompatible groups', () => {
  const rows = [100, 100, 85, 70, 60].map((score, id) => ({ id, score, band: 'starter', group: 'a', optIn: true }));
  const filter = { band: 'starter', group: 'a' };
  assert.deepEqual(rankRows(rows, filter).map((r) => r.rank), [1, 1, 3, 4, 5]);
  assert.deepEqual(rankRows(rows.map((r) => r.id === 4 ? { ...r, optIn: false } : r), filter), []);
  assert.deepEqual(rankRows(rows.map((r) => r.id === 4 ? { ...r, band: 'main' } : r), filter), []);
  assert.deepEqual(rankRows(rows.map((r) => r.id === 4 ? { ...r, group: 'other' } : r), filter), []);
});
check('starter and comeback bands are not a professional-competence score', () => {
  assert.equal(bandFor(0, false), 'starter');
  assert.equal(bandFor(1, true), 'starter');
  assert.equal(bandFor(2, false), 'main');
  assert.equal(bandFor(2, true), 'returning');
});
let arithmeticCases = 0;
check('exhaustive integer rubric domain is bounded and monotone (denominators 1..100)', () => {
  for (let possible = 1; possible <= 100; possible++) {
    let previous = -1;
    for (let earned = 0; earned <= possible; earned++) {
      const score = rubricScore([{ id: 'x', status: 'assessed', earned, possible }]);
      assert.ok(score >= 0 && score <= 100 && score >= previous);
      if (earned === possible) assert.equal(score, 100);
      previous = score;
      arithmeticCases++;
    }
  }
});
console.log(`PASS: ${checks} reference checks; ${arithmeticCases} exhaustive arithmetic cases.`);
console.log('Not tested: production engine, migrations, HTTP, database concurrency, UI or learning efficacy.');
