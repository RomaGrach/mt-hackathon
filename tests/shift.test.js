import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { harness } from './shift-helper.js';
import { Store } from '../backend/storage.js';
import { Service } from '../backend/service.js';
import { commandFor } from '../src/shift-view.js';
import { SHIFT_CONTENT, validateShiftContent } from '../backend/shift-content.js';
import { publishShiftContent } from '../backend/shift-service.js';
import {
  createShift,
  reduceShift,
  publicShiftState,
  scheduleShiftEvent,
} from '../backend/shift-engine.js';
const use = (t) => {
  const h = harness();
  t.after(() => h.store.close());
  return h;
};
const finishLate = (h, id) => {
  h.act('choose', id);
  h.work('confirm-and-return-p1');
  return h.finish();
};
const errorCode = (fn, code) => assert.throws(fn, (e) => e.code === code);
for (const [name, action, safety, points, passed, error] of [
  ['раннее обнаружение', null, 90, 70, true, null],
  ['поздний безопасный исход', 'clear-aisle', 75, 60, true, null],
  ['небезопасное откладывание', 'unsafe-deferral', 35, 50, false, 'unsafe_deferral'],
  ['таймаут', 'timeout', 40, 50, false, 'critical_timeout'],
])
  test('v2 настоящая трасса: ' + name, (t) => {
    const h = use(t);
    h.start();
    let result;
    if (!action) result = h.early();
    else {
      h.latePrefix();
      if (action === 'timeout') {
        h.now = h.run.criticalWindow.deadline;
        h.run = h.v2.get(h.profile, h.run.id);
        h.work('confirm-and-return-p1');
        result = h.finish();
      } else result = finishLate(h, action);
    }
    assert.deepEqual(result.scales, { loyalty: 85, safety });
    assert.equal(result.episodePoints, points);
    assert.equal(result.passed, passed);
    assert.deepEqual(
      result.criticalErrors.map((e) => e.code),
      error ? [error] : []
    );
    const stored = h.v2.load(h.profile, h.run.id).s;
    assert.equal(stored.incidents['a-seat'].handoff.status, 'completed');
    assert.equal(stored.tasks['return-p1'].status, 'completed');
    assert.equal(h.store.get('SELECT COUNT(*) n FROM results WHERE run_id=?', h.run.id).n, 1);
    assert.equal(h.v2.exactReplay(h.profile, h.run.id).verified, true);
  });

test('v2 проекция скрывает второй инцидент; навигация не расходует время; события имеют стабильный порядок', (t) => {
  const h = use(t);
  h.start();
  h.act('begin');
  h.work('inspect-predeparture', null);
  for (const forbidden of [
    'b-aisle',
    'p3',
    'bagBlocksAisle',
    'scheduledEvents',
    'criteria',
    'comparisonGroup',
    'safeActions',
    'early-discovery',
  ])
    assert.equal(JSON.stringify(h.run).includes(forbidden), false, forbidden);
  h.act('continue');
  const step = h.run.step;
  h.act('focus', 'a-seat');
  h.act('overview');
  h.act('focus', 'a-seat');
  assert.equal(h.run.step, step);
  h.work('acknowledge-and-promise');
  h.work('verify-and-request');
  h.act('continue');
  h.act('wait');
  assert.deepEqual(h.run.criticalWindow, { status: 'pending' });
  assert.equal(h.run.scene, null);
  assert.equal(
    h.run.actions.some((a) => a.actionId === 'clear-aisle'),
    false
  );
  const state = h.v2.load(h.profile, h.run.id).s;
  assert.equal(state.incidents['a-seat'].handoff.status, 'accepted');
  assert.equal(state.incidents['a-seat'].status, 'waiting');
  const events = state.log.filter(
    (e) => e.type === 'handoff_accepted' || e.type === 'incident_changed'
  );
  assert.deepEqual(
    events.map((e) => e.type),
    ['handoff_accepted', 'incident_changed']
  );
  h.now += 100000;
  h.act('continue');
  assert.equal(h.run.criticalWindow.deadline, h.now + 20000);
});

test('v2 чужой адресат не закрывает обещание; просрочка один раз, позднее выполнение возможно', (t) => {
  const h = use(t);
  h.start();
  h.latePrefix();
  h.act('choose', 'clear-aisle');
  h.work('confirm-and-return-p2');
  assert.equal(h.run.tasks.find((t) => t.id === 'return-p1').status, 'open');
  h.act('continue');
  h.act('wait');
  assert.equal(h.run.step, 7);
  assert.equal(h.run.scales.loyalty, 60);
  h.work('confirm-and-return-p1');
  const result = h.finish();
  assert.equal(result.scales.loyalty, 70);
  assert.equal(result.passed, true);
  const s = h.v2.load(h.profile, h.run.id).s;
  assert.equal(s.log.filter((e) => e.type === 'task_deadline_breached').length, 1);
  assert.ok(s.tasks['return-p1'].breachResolvedByEventId);
});

for (const difference of [-1, 0, 1])
  test(
    'v2 граница deadline ' +
      difference +
      ': поздний запрос коммитит один timeout, receipt неизменен',
    (t) => {
      const h = use(t);
      h.start();
      h.latePrefix();
      const r = h.run;
      const body = {
        requestId: h.key(),
        revision: r.revision,
        command: commandFor(r.actions.find((a) => a.actionId === 'clear-aisle')),
      };
      h.now = r.criticalWindow.deadline + difference;
      const first = h.v2.command(h.profile, r.id, body),
        second = h.v2.command(h.profile, r.id, body);
      assert.deepEqual(first, second);
      assert.equal(first.status, difference < 0 ? 200 : 409);
      h.run = h.v2.get(h.profile, r.id);
      h.service.sweep();
      h.v2.get(h.profile, r.id);
      const s = h.v2.load(h.profile, r.id).s;
      assert.equal(s.step, 5);
      assert.equal(
        s.log.filter((e) => e.type === 'critical_timeout').length,
        difference < 0 ? 0 : 1
      );
      assert.equal(s.scales.safety, difference < 0 ? 75 : 40);
      errorCode(
        () => h.v2.command(h.profile, r.id, { ...body, revision: body.revision + 1 }),
        'KEY_REUSED'
      );
    }
  );

test('v2 старый revision не переисполняется и чужой профиль не видит попытку', (t) => {
  const h = use(t);
  h.start();
  const id = h.run.id,
    body = { requestId: h.key(), revision: 0, command: { type: 'begin' } };
  const first = h.v2.command(h.profile, id, body);
  assert.equal(first.status, 200);
  const stale = h.v2.command(h.profile, id, { ...body, requestId: h.key() });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error.code, 'STALE_REVISION');
  const other = h.player();
  errorCode(() => h.v2.get(other.profile, id), 'NOT_FOUND');
  errorCode(
    () =>
      h.v2.command(other.profile, id, {
        requestId: h.key(),
        revision: 1,
        command: { type: 'abort' },
      }),
    'NOT_FOUND'
  );
  assert.equal(h.v2.load(h.profile, id).s.revision, 1);
});

test('v2 training pause/hint сохраняет остаток; assessment не предлагает помощь', (t) => {
  const h = use(t);
  h.start({ timingPolicyId: 'extended' });
  h.latePrefix();
  assert.equal(h.run.criticalWindow.durationMs, 200000);
  h.now += 12345;
  h.act('hint');
  assert.equal(h.run.phase, 'paused');
  assert.equal(h.run.criticalWindow.remainingMs, 187655);
  assert.ok(h.run.hintText);
  h.now += 999999;
  h.service.sweep();
  h.run = h.v2.get(h.profile, h.run.id);
  assert.equal(h.run.phase, 'paused');
  h.act('resume');
  assert.equal(h.run.criticalWindow.deadline, h.now + 187655);
  finishLate(h, 'assist-aisle');
  assert.equal(h.run.result.hasHints, true);
  assert.equal(h.run.result.hasPause, true);
  const p = h.player();
  p.start({ mode: 'assessment' });
  p.latePrefix();
  assert.equal(
    p.run.actions.some((a) => ['hint', 'pause'].includes(a.command)),
    false
  );
  const bad = p.v2.command(p.profile, p.run.id, {
    requestId: p.key(),
    revision: p.run.revision,
    command: { type: 'pause' },
  });
  assert.equal(bad.status, 409);
});

test('v2 untimed сохраняет неопределённость критерия времени вместо нуля', (t) => {
  const h = use(t);
  h.start({ timingPolicyId: 'untimed' });
  h.latePrefix();
  assert.equal(h.run.criticalWindow.deadline, null);
  h.now += 864000000;
  h.service.sweep();
  const r = finishLate(h, 'clear-aisle'),
    c = r.criteria.find((x) => x.id === 'timely-safety');
  assert.equal(c.status, 'not_assessed');
  assert.equal(c.earned, null);
  assert.equal(c.possible, null);
  assert.equal(r.passed, true);
  assert.equal(r.possibleEpisodePoints, 60);
});

for (const serviceClass of ['standard', 'comfort', 'business', 'first'])
  test('v2 содержательный сервисный вариант: ' + serviceClass, (t) => {
    const h = use(t);
    h.start({ variantId: 'clear-aisle-service-check', serviceClass });
    h.act('begin');
    assert.ok(h.run.actions[0].label.includes(SHIFT_CONTENT.policies[serviceClass].check));
    h.work('inspect-predeparture', null);
    h.work('acknowledge-and-promise');
    h.act('continue');
    h.act('inspect');
    h.act('continue');
    h.act('focus', 'b-service');
    const other = Object.keys(SHIFT_CONTENT.policies).find((x) => x !== serviceClass);
    const body = {
      requestId: h.key(),
      revision: h.run.revision,
      command: {
        type: 'choose',
        incidentId: 'b-service',
        sceneId: h.run.scene.id,
        windowId: null,
        actionId: 'correct-' + other + '-card',
      },
    };
    assert.equal(h.v2.command(h.profile, h.run.id, body).status, 409);
    h.work('correct-' + serviceClass + '-card', 'b-service');
    h.work('verify-and-request');
    h.act('continue');
    h.act('wait');
    h.work('confirm-and-return-p1');
    const r = h.finish();
    assert.equal(r.passed, true);
    assert.equal(r.episodePoints, 70);
    assert.deepEqual(r.scales, { loyalty: 90, safety: 80 });
    assert.ok(r.criteria.some((c) => c.id === 'service-consistency' && c.earned === 1));
    assert.equal(
      h.v2.load(h.profile, h.run.id).s.flags.correctedPolicyId,
      SHIFT_CONTENT.policies[serviceClass].id
    );
  });

test('v2 пропущенная приёмка добавляет позднюю проверку, не чинит зачёт задним числом', (t) => {
  const h = use(t);
  h.start();
  h.act('begin');
  h.work('skip-predeparture', null);
  h.work('acknowledge');
  h.act('continue');
  h.act('focus', 'a-seat');
  assert.ok(h.run.actions.some((a) => a.actionId === 'verify-service-info'));
  assert.equal(
    h.run.actions.some((a) => a.actionId === 'verify-and-request'),
    false
  );
  h.act('choose', 'verify-service-info');
  h.act('continue');
  h.act('wait');
  h.act('continue');
  h.act('choose', 'clear-aisle');
  h.work('verify-and-request');
  h.act('continue');
  h.act('wait');
  h.work('confirm-and-return-p1');
  const r = h.finish();
  assert.equal(r.passed, false);
  assert.ok(r.reasons.includes('inspection_not_passed'));
});

test('v2 лимит рабочих шагов завершает смену; aborted не получает XP', (t) => {
  const h = use(t);
  h.start({ variantId: 'clear-aisle-service-check' });
  h.act('begin');
  h.work('inspect-predeparture', null);
  while (h.run.phase !== 'result') {
    if (h.run.phase === 'feedback') h.act('continue');
    else h.act('wait');
  }
  assert.equal(h.run.step, 16);
  assert.ok(h.run.result.reasons.includes('step_limit'));
  assert.equal(h.run.result.passed, false);
  h.start();
  h.act('begin');
  h.work('inspect-predeparture', null);
  h.act('abort');
  assert.equal(h.ack().body.deltaXP, 0);
});

test('v2 и v1 не создают две активные попытки, включая серверную паузу', (t) => {
  const h = use(t);
  h.start();
  h.act('begin');
  h.act('pause');
  errorCode(() => h.service.start(h.profile, 'conflict', false, h.key()), 'ACTIVE_RUN');
  assert.equal(
    h.v2.start(h.profile, {
      requestId: h.key(),
      scenarioId: 'text-shift-demo',
      mode: 'training',
      timingPolicyId: 'standard',
    }).status,
    409
  );
  h.act('abort');
  h.service.start(h.profile, 'conflict', false, h.key());
  assert.equal(
    h.v2.start(h.profile, {
      requestId: h.key(),
      scenarioId: 'text-shift-demo',
      mode: 'training',
      timingPolicyId: 'standard',
    }).status,
    409
  );
});

test('v2 restart сохраняет deadline, версия отключается только для новых попыток, replay использует pinned bytes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'reis-v2-')),
    file = join(dir, 'test.sqlite');
  let h = harness(file),
    store = h.store;
  try {
    h.start();
    h.latePrefix();
    const id = h.run.id,
      profile = h.profile,
      deadline = h.run.criticalWindow.deadline;
    store.run('UPDATE shift_publications SET enabled=0');
    store.close();
    store = new Store(file);
    const service = new Service(store, { clock: () => deadline });
    const r = service.shifts.get(profile, id);
    assert.equal(r.feedback.timedOut, true);
    assert.equal(r.scales.safety, 40);
    assert.equal(
      service.shifts.load(profile, id).s.log.filter((e) => e.type === 'critical_timeout').length,
      1
    );
    assert.equal(store.get('SELECT enabled FROM shift_publications').enabled, 0);
    const changed = structuredClone(SHIFT_CONTENT);
    changed.title += ' changed';
    assert.throws(
      () => publishShiftContent(store, changed, deadline),
      (e) => e.code === 'IMMUTABLE_CONTENT'
    );
    store.run(
      'UPDATE scenarios SET document=? WHERE id=? AND version=?',
      JSON.stringify(changed),
      SHIFT_CONTENT.id,
      SHIFT_CONTENT.version
    );
    errorCode(() => service.shifts.get(profile, id), 'CONTENT_INTEGRITY');
  } finally {
    try {
      store.close();
    } catch {}
    rmSync(dir, { recursive: true, force: true });
  }
});

test('v2 публикация проверяет циклы, классы, рубрику и безопасную альтернативу', () => {
  assert.deepEqual(validateShiftContent(SHIFT_CONTENT), []);
  for (const edit of [
    (c) => c.localGraphs.a['a-return'].push('a-listen'),
    (c) => delete c.policies.first,
    (c) => c.rubric.push(c.rubric[0]),
    (c) => (c.variants['blocked-aisle'].safeActions = []),
  ]) {
    const c = structuredClone(SHIFT_CONTENT);
    edit(c);
    assert.ok(validateShiftContent(c).length);
  }
  const s = createShift(SHIFT_CONTENT, { id: 'test', profileId: 'p' }, 1000);
  assert.throws(() => scheduleShiftEvent(s, { eventId: 'bad', dueStep: 0, priority: 20 }));
});

test('v2 точная история без наград, новая ветка с происхождением и свежим таймером', (t) => {
  const h = use(t);
  h.start();
  h.latePrefix();
  h.now = h.run.criticalWindow.deadline;
  h.run = h.v2.get(h.profile, h.run.id);
  h.work('confirm-and-return-p1');
  h.finish();
  const original = h.run,
    timeout = original.result.history.find((e) => e.title.includes('истёк'));
  assert.ok(timeout.replayable);
  const old = h.v2.exactReplay(h.profile, original.id);
  assert.equal(old.verified, true);
  assert.equal(old.rewardsIssued, false);
  assert.equal(h.v2.motivationView(h.profile).lifetimePracticeXP, 0);
  const branch = h.v2.replay(h.profile, original.id, {
    requestId: h.key(),
    originEventSeq: timeout.eventSeq,
  });
  assert.equal(branch.status, 201);
  h.run = branch.body;
  assert.notEqual(h.run.id, original.id);
  assert.equal(h.run.mode, 'training');
  assert.deepEqual(h.run.criticalWindow, { status: 'pending' });
  h.now += 999999;
  h.act('continue');
  assert.equal(h.run.criticalWindow.deadline, h.now + 20000);
  h.act('choose', 'clear-aisle');
  h.work('confirm-and-return-p1');
  h.finish();
  assert.equal(h.run.result.passed, true);
  assert.equal(h.run.result.origin.runId, original.id);
  assert.equal(h.v2.get(h.profile, original.id).result.criticalError, true);
  assert.equal(h.v2.exactReplay(h.profile, h.run.id).verified, true);
  assert.equal(h.ack().body.deltaXP, 10);
  h.start();
  h.early();
  assert.equal(h.ack().body.deltaXP, 10);
  assert.equal(h.v2.motivationView(h.profile).lifetimePracticeXP, 20);
});

test('v2 завершённая с ошибкой задача не получает повторную просрочку после закрытия', (t) => {
  const h = use(t);
  h.start();
  h.act('begin');
  h.work('inspect-predeparture', null);
  h.act('continue');
  h.act('inspect');
  h.work('clear-aisle', 'b-aisle');
  h.work('acknowledge-and-promise');
  h.work('resolve-without-verification');
  h.act('continue');
  h.act('inspect');
  h.act('continue');
  h.act('inspect');
  assert.equal(h.run.step, 7);
  const s = h.v2.load(h.profile, h.run.id).s;
  assert.equal(s.tasks['return-p1'].status, 'failed');
  assert.equal(s.log.filter((e) => e.type === 'task_deadline_breached').length, 0);
  assert.ok(
    s.log.some((e) => e.type === 'event_skipped' && e.payload.scheduledEventId === 'return-due')
  );
  assert.equal(h.run.scales.loyalty, 65);
  assert.equal(h.finish().passed, false);
});
