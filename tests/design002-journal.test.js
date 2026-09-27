import test from 'node:test';
import assert from 'node:assert/strict';
import { DESIGN002_CONTENT as c } from '../backend/design002-content.js';
import {
  createDesignShift as create,
  reduceDesignShift as reduce,
  publicDesignShift as view,
} from '../backend/design002-engine.js';
import { designShift } from '../src/design002-view.js';
import { harness } from './shift-helper.js';
const now = 1800000000000;
const opts = {
  id: 'journal-check',
  profileId: 'tester',
  mode: 'training',
  serviceClass: 'standard',
  timingPolicyId: 'extended',
  variantId: 'orientation',
};
test('briefing never publishes premature tasks or history; old states are filtered too', () => {
  const s = create(c, opts, now);
  assert.equal(s.tasks.length, 0);
  assert.equal(s.log.length, 0);
  const old = structuredClone(c);
  delete old.journalVersion;
  const legacy = create(old, opts, now);
  assert.equal(legacy.tasks.length, 2);
  for (const state of [s, legacy]) {
    const r = view(state, c, now);
    assert.deepEqual(r.log, []);
    assert.deepEqual(r.tasks, []);
    assert.match(designShift(r), /Смена ещё не началась/);
  }
  const started = reduce(s, { type: 'begin' }, c, now);
  assert.equal(started.log[0].type, 'begin');
  assert.equal(started.tasks.length, 2);
});
test('history never previews dialogue or hidden appearances; actions have choice, address and consequences', () => {
  let s = reduce(create(c, opts, now), { type: 'begin' }, c, now);
  let r = view(s, c, now);
  for (const e of r.log.filter((e) => e.type === 'appeared'))
    assert.equal(e.text, 'Поступило новое обращение.');
  const p = s.problems.find((p) => p.status === 'active' && p.revealed);
  s = reduce(s, { type: 'focus', incidentId: p.id }, c, now);
  r = view(s, c, now);
  assert.equal(r.log.at(-1).type, 'interaction');
  assert.equal(r.log.at(-1).seat, p.seat);
  const a = r.actions.find((a) => a.command === 'choose' && a.available !== false);
  s = reduce(
    s,
    {
      type: 'choose',
      incidentId: p.id,
      sceneId: a.sceneId,
      actionId: a.actionId,
      windowId: a.windowId,
    },
    c,
    now
  );
  const chosen = view(s, c, now).log.find((e) => e.choice === a.label);
  assert.ok(chosen);
  assert.equal(chosen.seat, p.seat);
  assert.match(designShift(view(s, c, now)), /<b>Вы:<\/b>/);
  // Even after discovery, the player learns about it at discovery, not via a
  // backdated appearance. Exact hidden chronology becomes available at debrief.
  s.log.push({
    eventId: 'hidden-proof',
    type: 'appeared',
    title: 'Скрытая причина',
    text: 'Неизвестная деталь',
    hidden: true,
    incidentId: p.id,
  });
  assert.ok(!view(s, c, now).log.some((e) => e.eventId === 'hidden-proof'));
  s = reduce(s, { type: 'abort' }, c, now);
  assert.ok(view(s, c, now).log.some((e) => e.eventId === 'hidden-proof'));
});
test('result opens as a short summary with four optional detail groups', () => {
  let s = reduce(create(c, opts, now), { type: 'begin' }, c, now);
  s = reduce(s, { type: 'abort' }, c, now);
  const html = designShift(view(s, c, now));
  assert.equal((html.match(/<details class="d2-result-group"/g) || []).length, 4);
  assert.doesNotMatch(html, /<details[^>]*\sopen/);
  const summary = html.split('<div class="d2-result-details">')[0];
  assert.match(summary, /Сохранено автоматически/);
  assert.match(summary, /К курсу/);
  assert.doesNotMatch(summary, /d2-review|d2-log/);
});
test('enriched journal survives reload and exact replay', (t) => {
  const h = harness();
  t.after(() => h.store.close());
  h.start({ scenarioId: 'design002', variantId: 'orientation', timingPolicyId: 'extended' });
  h.act('begin');
  const focus = h.run.actions.find((a) => a.command === 'focus');
  h.act('focus', focus.incidentId);
  h.act('abort');
  assert.equal(h.v2.exactReplay(h.profile, h.run.id).verified, true);
  assert.deepEqual(h.v2.get(h.profile, h.run.id).log, h.run.log);
  assert.ok(h.run.log.some((e) => e.type === 'interaction'));
});
