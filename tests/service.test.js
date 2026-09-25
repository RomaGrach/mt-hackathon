import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../backend/storage.js';
import { Service } from '../backend/service.js';

const routes = {
  conflict: ['listen', 'resolve', 'verified', 'confirm', 'follow'],
  medical: ['call', 'space', 'facts', 'protocol', 'privacy'],
  delay: ['coordinate', 'update', 'check', 'plan', 'verified'],
  service: ['acknowledge', 'check', 'consent', 'feedback'],
  baggage: ['owner', 'confirm', 'rack', 'clear']
};
function fixture(t, filename = ':memory:') {
  let now = Date.UTC(2026, 8, 25, 10);
  const store = new Store(filename); const svc = new Service(store, { clock: () => now });
  const a = svc.createSession('msk-1'); const b = svc.createSession('spb-1');
  t.after(() => store.close());
  return { svc, store, a, b, tick: (ms) => { now += ms; } };
}
function command(svc, user, run, kind, extra = {}) {
  return svc.act(user, run.id, kind, { revision: run.revision, requestId: randomUUID(), ...extra });
}
function finish(svc, user, scenario = 'conflict', practice = false, choices = routes[scenario]) {
  let run = svc.start(user, scenario, practice, randomUUID());
  for (const optionId of choices) {
    run = command(svc, user, run, 'decision', { optionId });
    run = command(svc, user, run, 'continue');
  }
  assert.equal(run.phase, 'result'); return run;
}

test('профиль синтетический, сессия истекает, чужие попытки недоступны', (t) => {
  const { svc, a, b, tick } = fixture(t);
  assert.match(svc.bootstrap(a.profileId).profile.name, /^Проводник-[A-F0-9]{6}$/);
  assert.equal(svc.session(a.token), a.profileId);
  const run = svc.start(a.profileId, 'conflict', false, randomUUID());
  assert.throws(() => svc.getRun(b.profileId, run.id), (e) => e.status === 404);
  assert.throws(() => command(svc, b.profileId, run, 'abort'), (e) => e.status === 404);
  tick(8 * 86400000); assert.equal(svc.session(a.token), null);
});
test('idempotency start/decision: один переход и одна запись, другой payload не принят', (t) => {
  const { svc, store, a } = fixture(t); const id = randomUUID();
  const run = svc.start(a.profileId, 'conflict', false, id);
  assert.deepEqual(svc.start(a.profileId, 'conflict', false, id), run);
  assert.throws(() => svc.start(a.profileId, 'medical', false, id), (e) => e.code === 'KEY_REUSED');
  const body = { optionId: 'listen', revision: 0, requestId: randomUUID() };
  const next = svc.act(a.profileId, run.id, 'decision', body);
  assert.deepEqual(svc.act(a.profileId, run.id, 'decision', body), next);
  assert.equal(store.get('SELECT COUNT(*) AS n FROM runs').n, 1);
  assert.equal(store.get("SELECT COUNT(*) AS n FROM events WHERE kind='decision'").n, 1);
  assert.throws(() => command(svc, a.profileId, run, 'decision', { optionId: 'order' }), (e) => e.code === 'STALE_REVISION');
});
test('таймаут применяется на сервере без открытой страницы и не дублируется', (t) => {
  const { svc, store, a, tick } = fixture(t);
  const run = svc.start(a.profileId, 'medical', false, randomUUID());
  tick(5000); assert.equal(svc.getRun(a.profileId, run.id).deadline, run.deadline);
  tick(16000); svc.sweep(); svc.sweep();
  const result = svc.getRun(a.profileId, run.id);
  assert.equal(result.history.length, 1); assert.equal(result.history[0].timedOut, true);
  assert.equal(store.get("SELECT COUNT(*) AS n FROM events WHERE kind='timeout'").n, 1);
});
test('полная смена: баллы, семь правил достижений, общие рейтинги и повтор без фарма', (t) => {
  const { svc, a, b } = fixture(t);
  for (const scenario of Object.keys(routes)) finish(svc, a.profileId, scenario);
  const profile = svc.bootstrap(a.profileId).profile;
  assert.equal(profile.completed.length, 5); assert.ok(profile.level > 3);
  assert.ok(profile.achievements.includes('all-routes')); assert.ok(profile.achievements.includes('safe-hands'));
  finish(svc, a.profileId); assert.equal(svc.bootstrap(a.profileId).profile.totalPoints, profile.totalPoints);
  assert.equal(svc.leaderboard(a.profileId, 'crew').total, 1);
  assert.equal(svc.leaderboard(a.profileId, 'company').total, 2);
  svc.updateProfile(b.profileId, 'msk-2'); assert.equal(svc.leaderboard(a.profileId, 'depot').total, 2);
  assert.equal(svc.leaderboard(a.profileId, 'company').rows[0].name, profile.name);
});
test('практика и незачёт исключены из рейтинга, но доступны для разбора', (t) => {
  const { svc, a } = fixture(t);
  finish(svc, a.profileId, 'medical', false, ['wait', 'urgent', 'facts', 'protocol', 'privacy']);
  assert.equal(svc.bootstrap(a.profileId).profile.totalPoints, 0);
  finish(svc, a.profileId, 'conflict', true);
  let p = svc.bootstrap(a.profileId).profile;
  assert.equal(p.totalPoints, 0); assert.equal(p.analytics.practiceAttempts, 1); assert.equal(p.analytics.criticalAttempts, 1);
  const result = finish(svc, a.profileId, 'medical');
  p = svc.bootstrap(a.profileId).profile; assert.ok(p.achievements.includes('recovery'));
  const replay = svc.replay(a.profileId, result.id, 2, randomUUID()); assert.equal(replay.practice, true);
  const stopped = command(svc, a.profileId, replay, 'abort'); assert.equal(stopped.result.passed, false);
  assert.equal(svc.bootstrap(a.profileId).profile.totalPoints, p.totalPoints);
});
test('челлендж выдаётся один раз, сезонные бонусы истекают, уведомления читаются', (t) => {
  const { svc, store, a, tick } = fixture(t);
  finish(svc, a.profileId, 'conflict'); finish(svc, a.profileId, 'medical');
  const boot = svc.bootstrap(a.profileId);
  assert.equal(boot.challenge.completed, true); assert.equal(boot.profile.seasonPoints, 125);
  svc.bootstrap(a.profileId); finish(svc, a.profileId, 'conflict');
  assert.equal(store.get('SELECT COUNT(*) AS n FROM bonuses WHERE profile_id=?', a.profileId).n, 2);
  assert.ok(boot.notices.some((n) => n.kind === 'expiry'));
  const marked = svc.markRead(a.profileId, boot.notices.map((n) => n.id)); assert.ok(marked.every((n) => n.readAt));
  tick(4 * 86400000); const next = svc.bootstrap(a.profileId);
  assert.equal(next.profile.seasonPoints, 0); assert.equal(next.profile.totalPoints, boot.profile.totalPoints);
});
test('экспорт без credentials, пагинация HR и каскадное удаление', (t) => {
  const { svc, store, a } = fixture(t);
  finish(svc, a.profileId); finish(svc, a.profileId, 'medical');
  const first = svc.integrationResults(0, 1); const second = svc.integrationResults(first.nextCursor, 1);
  assert.equal(first.hasMore, true); assert.notEqual(first.items[0].eventId, second.items[0].eventId);
  const exported = JSON.stringify(svc.exportProfile(a.profileId)); assert.ok(!exported.includes(a.token)); assert.ok(!exported.includes('sessions'));
  svc.deleteProfile(a.profileId);
  for (const table of ['runs', 'results', 'events', 'notices', 'bonuses', 'requests', 'sessions']) assert.equal(store.get('SELECT COUNT(*) AS n FROM ' + table + ' WHERE profile_id=?', a.profileId).n, 0);
});
test('SQLite переживает рестарт; тот же номер версии нельзя молча переписать', () => {
  const directory = mkdtempSync(join(tmpdir(), 'reis400-test-')); const filename = join(directory, 'test.sqlite');
  try {
    let store = new Store(filename); let svc = new Service(store, { clock: () => 1000 }); const a = svc.createSession();
    const run = svc.start(a.profileId, 'medical', false, randomUUID()); store.close();
    store = new Store(filename); svc = new Service(store, { clock: () => 22000 });
    assert.equal(svc.session(a.token), a.profileId); assert.equal(svc.getRun(a.profileId, run.id).history[0].timedOut, true);
    const changed = structuredClone(svc.catalog); changed[0].title += '!';
    assert.throws(() => store.publish(changed, 25000), /version/); store.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

