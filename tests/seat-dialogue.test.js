import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './shift-helper.js';
import {
  SHIFT_CONTENT,
  LEGACY_SHIFT_CONTENT,
  validateShiftContent,
} from '../backend/shift-content.js';
import { publishShiftContent } from '../backend/shift-service.js';
import { commandFor } from '../src/shift-view.js';
const fresh = () => harness(':memory:', Date.parse('2026-09-27T10:00:00Z'), null, 'elapsed');
function prepare(h, options = {}) {
  h.start({ timingPolicyId: 'untimed', ...options });
  h.act('begin');
  h.work('inspect-predeparture', null);
  h.work('acknowledge');
}
function resolveOther(h) {
  if (h.run.phase === 'feedback') h.act('continue');
  if (h.run.phase === 'scene') h.act('overview');
  h.act('inspect');
  const service = h.run.incidents.some((i) => i.id === 'b-service');
  h.work(
    service ? 'correct-' + h.run.context.serviceClass + '-card' : 'assist-aisle',
    service ? 'b-service' : 'b-aisle'
  );
}
for (const serviceClass of ['standard', 'comfort', 'business', 'first'])
  for (const variantId of ['blocked-aisle', 'clear-aisle-service-check'])
    test(`self-service dialogue completes without colleague: ${serviceClass}/${variantId}`, () => {
      const h = fresh();
      try {
        prepare(h, { serviceClass, variantId });
        h.work('ask-concern');
        assert.equal(h.run.feedback.presentation, 'dialogue');
        h.work('check-seat-yourself');
        resolveOther(h);
        h.work(serviceClass === 'standard' ? 'show-seat-yourself' : 'explain-seat-yourself');
        h.work('close-seat-yourself');
        const result = h.finish();
        assert.equal(result.passed, true);
        assert.equal(
          result.criteria.find((r) => r.id === 'confirmed-handoff').status,
          'not_assessed'
        );
        assert.equal(result.criteria.find((r) => r.id === 'verify-documents').earned, 1);
        assert.equal(result.criteria.find((r) => r.id === 'return-to-person').earned, 1);
        assert.ok(h.run.tasks.every((t) => t.status === 'completed'));
        assert.equal(h.v2.exactReplay(h.profile, h.run.id).verified, true);
        assert.ok(!result.history.some((e) => e.title.includes('передать запрос')));
      } finally {
        h.store.close();
      }
    });
test('self-service cannot be chosen before verification and abandoning confirmation fails the incident', () => {
  const h = fresh();
  try {
    prepare(h);
    h.act('continue');
    h.act('focus', 'a-seat');
    const base = h.run.actions.find((a) => a.command === 'choose');
    const forged = { ...commandFor(base), actionId: 'close-seat-yourself' };
    const denied = h.v2.command(h.profile, h.run.id, {
      requestId: h.key(),
      revision: h.run.revision,
      command: forged,
    });
    assert.equal(denied.status, 409);
    h.work('check-seat-yourself');
    resolveOther(h);
    h.work('explain-seat-yourself');
    h.work('leave-seat-without-answer');
    assert.equal(h.run.incidents.find((i) => i.id === 'a-seat').status, 'failed');
    assert.equal(h.finish().passed, false);
  } finally {
    h.store.close();
  }
});
test('delegating after own verification restores applicable teamwork criterion', () => {
  const h = fresh();
  try {
    prepare(h);
    h.work('check-seat-yourself');
    resolveOther(h);
    h.work('verify-and-request');
    h.act('continue');
    h.act('wait');
    h.act('continue');
    h.act('wait');
    h.work('confirm-and-return-p1');
    const r = h.finish();
    assert.equal(r.passed, true);
    assert.equal(r.criteria.find((c) => c.id === 'confirmed-handoff').earned, 1);
  } finally {
    h.store.close();
  }
});
test('old publication remains valid and an old pinned run replays after new publication is selected', () => {
  assert.deepEqual(validateShiftContent(LEGACY_SHIFT_CONTENT), []);
  assert.deepEqual(validateShiftContent(SHIFT_CONTENT), []);
  const h = harness();
  try {
    publishShiftContent(h.store, LEGACY_SHIFT_CONTENT, h.now + 1);
    h.start();
    assert.equal(h.run.contentVersion, 'shift-content-1');
    h.store.run(
      'UPDATE shift_publications SET enabled=0 WHERE content_version=?',
      LEGACY_SHIFT_CONTENT.version
    );
    assert.equal(h.v2.currentContent().version, 'shift-content-2');
    const r = h.early();
    assert.equal(r.passed, true);
    assert.equal(h.v2.exactReplay(h.profile, h.run.id).verified, true);
  } finally {
    h.store.close();
  }
});
