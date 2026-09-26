import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './shift-helper.js';
import { practiceWeek, dateKey, qualityPoints } from '../backend/motivation.js';
const DAY = 86400000;
const use = (t) => {
  const h = harness();
  t.after(() => h.store.close());
  return h;
};
const competitive = (h, early = true) => {
  h.start({ mode: 'assessment', competitionSlotId: 'shift' });
  if (early) return h.early();
  h.latePrefix();
  h.act('choose', 'clear-aisle');
  h.work('confirm-and-return-p1');
  return h.finish();
};
const changeEntry = (h, period, action) =>
  h.v2.entry(h.profile, period, { requestId: h.key(), action });
const prefs = (h, values) => h.v2.preferences(h.profile, { requestId: h.key(), ...values });

test('мотивация: XP только после первого ack, повтор не фармит и следующая неделя не меняет receipt', (t) => {
  const h = use(t);
  h.start();
  h.early();
  assert.equal(h.v2.motivationView(h.profile).lifetimePracticeXP, 0);
  const id = h.run.id,
    body = { requestId: h.key() };
  const first = h.v2.ack(h.profile, id, body),
    second = h.v2.ack(h.profile, id, body);
  assert.deepEqual(second, first);
  assert.equal(first.body.deltaXP, 20);
  assert.equal(h.ack().body.deltaXP, 0);
  assert.equal(h.ack().body.alreadyAcknowledged, true);
  h.now += 7 * DAY;
  assert.deepEqual(h.v2.ack(h.profile, id, body), first);
  assert.equal(h.ack().body.deltaXP, 0);
  h.start();
  h.early();
  assert.equal(h.ack().body.deltaXP, 20);
  assert.equal(h.v2.motivationView(h.profile).lifetimePracticeXP, 40);
});

test('мотивация: критическая ошибка сохраняет учебный XP, но даёт ноль СП', (t) => {
  const h = use(t);
  h.join();
  h.start({ mode: 'assessment', competitionSlotId: 'shift' });
  h.latePrefix();
  h.act('choose', 'unsafe-deferral');
  h.work('confirm-and-return-p1');
  h.finish();
  assert.equal(h.run.result.rankingEligible, false);
  assert.equal(h.run.result.seasonPoints, 0);
  assert.equal(h.run.result.criticalError, true);
  assert.equal(h.ack().body.deltaXP, 20);
  assert.equal(h.v2.motivationView(h.profile).participation.attemptsUsed, 1);
  assert.equal(h.v2.motivationView(h.profile).nextReview.criterionId, 'timely-safety');
});

test('мотивация: квота первых пяти семейств транзакционна, апгрейд 10→20 допускается после заполнения', (t) => {
  const h = use(t),
    p = h.join();
  // Pre-existing credits model independently published families; their count, not names, determines the cap.
  for (let i = 0; i < 5; i++)
    h.store.run(
      'INSERT INTO practice_credits VALUES(?,?,?,?)',
      h.profile,
      p.id,
      'fixture-family-' + i,
      20
    );
  h.start();
  h.early();
  assert.equal(h.ack().body.deltaXP, 0);
  assert.equal(h.v2.motivationView(h.profile).weeklyXP, 100);
  const q = h.player(),
    period = q.join();
  q.start();
  q.early();
  const original = q.run.result.history.find(
    (e) => e.replayable && e.title.includes('пассажиру у места 18')
  );
  const branch = q.v2.replay(q.profile, q.run.id, {
    requestId: q.key(),
    originEventSeq: original.eventSeq,
  });
  assert.equal(branch.status, 201);
  q.run = branch.body;
  q.work('confirm-and-return-p1');
  q.finish();
  assert.equal(q.ack().body.deltaXP, 10);
  for (let i = 0; i < 4; i++)
    h.store.run(
      'INSERT INTO practice_credits VALUES(?,?,?,?)',
      q.profile,
      period.id,
      'fixture-family-' + i,
      20
    );
  q.start();
  q.early();
  assert.equal(q.ack().body.deltaXP, 10);
  assert.equal(q.v2.motivationView(q.profile).weeklyXP, 100);
});

test('мотивация: согласие при begin, две попытки, отзыв не возвращает лимит, СП — максимум', (t) => {
  const h = use(t);
  const noOpt = h.v2.start(h.profile, {
    requestId: h.key(),
    scenarioId: 'text-shift-demo',
    mode: 'assessment',
    timingPolicyId: 'standard',
    competitionSlotId: 'shift',
  });
  assert.equal(noOpt.status, 409);
  const p = h.join();
  h.start({ mode: 'assessment', competitionSlotId: 'shift' });
  assert.equal(h.v2.motivationView(h.profile).participation.attemptsUsed, 0);
  changeEntry(h, p.id, 'withdraw');
  const begin = h.v2.command(h.profile, h.run.id, {
    requestId: h.key(),
    revision: 0,
    command: { type: 'begin' },
  });
  assert.equal(begin.status, 409);
  assert.equal(h.v2.get(h.profile, h.run.id).phase, 'briefing');
  changeEntry(h, p.id, 'join');
  h.latePrefix();
  h.act('choose', 'clear-aisle');
  h.work('confirm-and-return-p1');
  h.finish();
  assert.equal(h.run.result.seasonPoints, 85);
  const second = competitive(h);
  assert.equal(second.seasonPoints, 100);
  assert.equal(h.v2.motivationView(h.profile).participation.seasonPoints, 100);
  changeEntry(h, p.id, 'withdraw');
  changeEntry(h, p.id, 'join');
  h.start({ mode: 'assessment', competitionSlotId: 'shift' });
  const denied = h.v2.command(h.profile, h.run.id, {
    requestId: h.key(),
    revision: 0,
    command: { type: 'begin' },
  });
  assert.equal(denied.status, 409);
  assert.equal(denied.body.error.code, 'ATTEMPTS_EXHAUSTED');
  h.act('abort');
  h.start();
  h.early();
  assert.equal(h.run.result.rankingEligible, false);
  assert.equal(h.v2.motivationView(h.profile).participation.attemptsUsed, 2);
});

test('мотивация: прерванная начатая попытка расходует слот, брифинг без begin — нет', (t) => {
  const h = use(t);
  h.join();
  h.start({ mode: 'assessment', competitionSlotId: 'shift' });
  h.act('abort');
  assert.equal(h.v2.motivationView(h.profile).participation.attemptsUsed, 0);
  h.start({ mode: 'assessment', competitionSlotId: 'shift' });
  h.act('begin');
  h.act('abort');
  assert.equal(h.v2.motivationView(h.profile).participation.attemptsUsed, 1);
  assert.equal(h.ack().body.deltaXP, 0);
});

test('мотивация: точные московские границы; пересечение недели не даёт СП ни в одну', (t) => {
  const h = use(t),
    p = h.join();
  assert.equal(p.startAt, Date.parse('2026-09-20T21:00:00Z'));
  assert.equal(p.endAt, Date.parse('2026-09-27T21:00:00Z'));
  h.start({ mode: 'assessment', competitionSlotId: 'shift' });
  h.act('begin');
  h.work('inspect-predeparture', null);
  h.work('acknowledge-and-promise');
  h.act('continue');
  h.act('inspect');
  h.work('clear-aisle', 'b-aisle');
  h.work('verify-and-request');
  h.act('continue');
  h.act('wait');
  h.work('confirm-and-return-p1');
  h.now = p.endAt;
  h.finish();
  assert.equal(h.run.result.rankingEligible, false);
  assert.equal(h.run.result.rankingIneligibleReason, 'period_closed');
  assert.equal(h.run.result.seasonPoints, 0);
  assert.equal(h.ack().body.deltaXP, 20);
  assert.equal(h.v2.motivationView(h.profile).participation.seasonPoints, 0);
  assert.equal(h.v2.motivationView(h.profile).archives[0].score, 0);
  assert.notEqual(practiceWeek(p.endAt).id, p.id);
  assert.equal(practiceWeek(p.endAt - 1).id, p.id);
  assert.equal(dateKey(Date.parse('2026-09-26T21:00:00Z')), '2026-09-27');
});

test('мотивация: архив фиксирует СП/места; поздний отзыв и удаление скрывают данные без пересчёта других мест', (t) => {
  const h = use(t),
    players = [h, ...Array.from({ length: 4 }, () => h.player())];
  const p = h.join();
  for (let i = 0; i < players.length; i++) {
    const q = players[i];
    q.join();
    competitive(q, i < 2);
  }
  for (const scope of ['crew', 'depot', 'company']) {
    const x = h.v2.leaders(h.profile, scope, null, 0, 50);
    assert.equal(x.total, 5);
    assert.equal(x.insufficientParticipants, false);
    assert.deepEqual(
      x.rows.map((r) => r.rank),
      [1, 1, 3, 3, 3]
    );
  }
  const low = players[2],
    before = low.v2.leaders(low.profile, 'crew', null, 0, 50);
  assert.equal(before.me.rank, 3);
  h.now = p.endAt;
  const lowArchive = low.v2.leaders(low.profile, 'crew', p.id, 0, 50);
  assert.equal(lowArchive.me.rank, 3);
  assert.equal(h.v2.motivationView(h.profile).participation.seasonPoints, 0);
  assert.equal(h.v2.motivationView(h.profile).archives[0].score, 100);
  assert.equal(changeEntry(h, p.id, 'withdraw').status, 200);
  assert.equal(low.v2.leaders(low.profile, 'crew', p.id, 0, 50).me.rank, 3);
  h.service.deleteProfile(players[1].profile);
  const redacted = JSON.parse(
    h.store.get('SELECT archive FROM motivation_periods WHERE id=?', p.id).archive
  );
  assert.equal(JSON.stringify(redacted).includes(players[1].profile), false);
  assert.equal(low.v2.leaders(low.profile, 'crew', p.id, 0, 50).me.rank, 3);
  assert.equal(low.v2.leaders(low.profile, 'crew', p.id, 0, 50).rows.length, 3);
});

test('мотивация: четыре участника не получают места; нулевые строки и другие бригады не подмешиваются', (t) => {
  const h = use(t),
    players = [h, ...Array.from({ length: 3 }, () => h.player())];
  for (const p of players) {
    p.join();
    competitive(p);
  }
  const empty = h.player();
  empty.join();
  const outsiders = h.player();
  h.store.run("UPDATE profiles SET crew='spb-2',depot='Петербург' WHERE id=?", outsiders.profile);
  outsiders.join();
  competitive(outsiders);
  const crew = h.v2.leaders(h.profile, 'crew', null, 0, 50);
  assert.equal(crew.total, 4);
  assert.equal(crew.rows.length, 0);
  assert.equal(crew.me.rank, null);
  assert.equal(crew.me.score, 100);
  const company = h.v2.leaders(h.profile, 'company', null, 0, 50);
  assert.equal(company.total, 5);
  assert.equal(company.rows.length, 5);
  h.store.run("UPDATE profiles SET crew='spb-2' WHERE id=?", h.profile);
  assert.equal(h.v2.leaders(h.profile, 'crew', null, 0, 50).total, 4);
});

test('мотивация: личная строка вне top-50 и пагинация не меняют общий ранг', (t) => {
  const h = use(t);
  h.join();
  competitive(h, false);
  const p = h.v2.motivationView(h.profile).period;
  // Seed only the projection table after verified competition setup; leaderboard has no fake users in runtime.
  for (let i = 0; i < 55; i++) {
    const q = h.player();
    q.join();
    h.store.run(
      'UPDATE motivation_entries SET score=100 WHERE profile_id=? AND period_id=?',
      q.profile,
      p.id
    );
  }
  const page = h.v2.leaders(h.profile, 'crew', null, 0, 50);
  assert.equal(page.rows.length, 50);
  assert.equal(page.me.rank, 56);
  assert.equal(page.me.score, 85);
  assert.equal(page.hasMore, true);
  const end = h.v2.leaders(h.profile, 'crew', null, 50, 50);
  assert.equal(end.rows.length, 6);
  assert.equal(end.rows.at(-1).me, true);
  assert.equal(end.hasMore, false);
});

test('мотивация: цели по разным датам завершения, первый ack в той же неделе, снижение только на следующую', (t) => {
  const h = use(t);
  prefs(h, { goalDays: 3 });
  h.start();
  h.early();
  h.ack();
  assert.equal(h.v2.motivationView(h.profile).goal.days.length, 1);
  prefs(h, { goalDays: 1 });
  assert.equal(h.v2.motivationView(h.profile).goal.target, 3);
  assert.equal(h.v2.motivationView(h.profile).preferences.nextGoal, 1);
  h.start();
  h.early();
  h.ack();
  assert.equal(h.v2.motivationView(h.profile).goal.days.length, 1);
  h.now += DAY;
  h.start();
  h.early();
  h.ack();
  assert.equal(h.v2.motivationView(h.profile).goal.days.length, 2);
  const p = h.v2.motivationView(h.profile).period;
  h.now = p.endAt;
  assert.equal(h.v2.motivationView(h.profile).goal.target, 1);
  h.start();
  h.early();
  h.ack();
  assert.equal(h.v2.motivationView(h.profile).goal.completed, true);
  prefs(h, { goalDays: 3 });
  assert.equal(h.v2.motivationView(h.profile).goal.target, 1);
  assert.equal(h.v2.motivationView(h.profile).goal.completed, true);
});

test('мотивация: поздний ack получает XP в новой неделе, но не рисует учебный день в ней', (t) => {
  const h = use(t),
    p = h.v2.motivationView(h.profile).period;
  h.start();
  h.early();
  h.now = p.endAt;
  assert.equal(h.ack().body.deltaXP, 20);
  assert.equal(h.v2.motivationView(h.profile).goal.days.length, 0);
  assert.equal(h.v2.motivationView(h.profile).weeklyXP, 20);
  prefs(h, { paused: true });
  h.start();
  h.early();
  h.ack();
  assert.equal(h.v2.motivationView(h.profile).goal.days.length, 0);
});

test('мотивация: стартовый поток, returnPending до практики, пропущенная неделя его не расходует', (t) => {
  const h = use(t);
  for (let week = 0; week < 2; week++) {
    const p = h.join();
    assert.equal(h.v2.motivationView(h.profile).participation.band, 'starter');
    competitive(h);
    h.ack();
    h.now = p.endAt;
    h.v2.motivationView(h.profile);
  }
  h.now += 29 * DAY;
  let m = h.v2.motivationView(h.profile);
  assert.equal(m.returnPending, true);
  h.start();
  h.early();
  h.ack();
  assert.equal(h.v2.motivationView(h.profile).returnPending, true);
  const p = h.join();
  assert.equal(h.v2.motivationView(h.profile).participation.band, 'returning');
  h.now = p.endAt;
  h.v2.motivationView(h.profile);
  assert.equal(h.v2.motivationView(h.profile).returnPending, true);
  const next = h.join();
  competitive(h);
  h.ack();
  h.now = next.endAt;
  assert.equal(h.v2.motivationView(h.profile).returnPending, false);
  h.join();
  assert.equal(h.v2.motivationView(h.profile).participation.band, 'main');
});

test('мотивация: критическое повторение не стирается untimed-практикой, закрывается новым свидетельством', (t) => {
  const h = use(t);
  h.start();
  h.latePrefix();
  h.act('choose', 'unsafe-deferral');
  h.work('confirm-and-return-p1');
  h.finish();
  h.ack();
  const failed = h.run.id;
  assert.equal(h.v2.motivationView(h.profile).nextReview.criterionId, 'timely-safety');
  h.start({ timingPolicyId: 'untimed' });
  h.early();
  h.ack();
  assert.equal(h.v2.motivationView(h.profile).nextReview.originRunId, failed);
  h.start();
  h.early();
  h.ack();
  assert.equal(h.v2.motivationView(h.profile).nextReview.criterionId, null);
  const events = h.store
    .all(
      "SELECT data FROM motivation_events WHERE profile_id=? AND kind='review_updated'",
      h.profile
    )
    .map((e) => JSON.parse(e.data));
  assert.equal(events.filter((e) => e.repaired).length, 1);
  assert.equal(h.v2.motivationView(h.profile).lifetimePracticeXP, 20);
  assert.ok(h.v2.motivationView(h.profile).awards.some((a) => a.id === 'recovery'));
});

test('мотивация: уведомления 1/визит и 3/неделю, нет во время смены, нет expiry после срока', (t) => {
  const h = use(t);
  let m = h.v2.motivationView(h.profile);
  assert.ok(m.automaticNotice);
  assert.equal(h.v2.motivationView(h.profile).automaticNotice, null);
  for (let i = 0; i < 3; i++) {
    h.now += 31 * 60000;
    h.v2.motivationView(h.profile);
  }
  assert.equal(
    h.store.get('SELECT COUNT(*) n FROM motivation_notice_views WHERE profile_id=?', h.profile).n,
    3
  );
  h.start();
  h.now += 31 * 60000;
  assert.equal(h.v2.motivationView(h.profile).automaticNotice, null);
  h.early();
  h.join();
  competitive(h);
  m = h.v2.motivationView(h.profile);
  const p = m.period;
  h.now = p.endAt - 1000;
  m = h.v2.motivationView(h.profile);
  assert.ok(h.service.notices(h.profile).some((n) => n.id.includes(':v2:expiry:' + p.id)));
  h.now = p.endAt;
  const after = h.v2.motivationView(h.profile);
  assert.notEqual(after.automaticNotice?.kind, 'expiry');
  prefs(h, { paused: true });
  h.now += 31 * 60000;
  assert.equal(h.v2.motivationView(h.profile).automaticNotice, null);
});

test('мотивация: все четыре MVP-награды достижимы, постоянны и не выводят пригодность', (t) => {
  const h = use(t);
  prefs(h, { goalDays: 1 });
  h.start();
  h.latePrefix();
  h.act('choose', 'unsafe-deferral');
  h.work('confirm-and-return-p1');
  h.finish();
  h.ack();
  h.start();
  h.early();
  h.ack();
  const p = h.v2.motivationView(h.profile).period;
  h.now = p.endAt;
  h.start();
  h.early();
  h.ack();
  const m = h.v2.motivationView(h.profile);
  assert.deepEqual(m.awards.map((a) => a.id).sort(), [
    'first-step',
    'own-rhythm',
    'recovery',
    'safe-hands',
  ]);
  assert.equal(m.notForEmploymentDecisions, true);
  assert.equal(m.practiceLevel, 1);
});

test('мотивация: отказ некорректной рубрике и неизвестным параметрам без частичных наград', (t) => {
  const h = use(t);
  h.start();
  h.early();
  const r = h.run.result;
  assert.equal(qualityPoints(r), 100);
  for (const edit of [
    (r) => (r.criteria[0].earned = 2),
    (r) => r.criteria.push(r.criteria[0]),
    (r) => (r.criteria[0].possible = 0),
  ]) {
    const c = structuredClone(r);
    edit(c);
    assert.throws(() => qualityPoints(c));
  }
  assert.equal(prefs(h, { goalDays: 1, automaticNotices: 'yes' }).status, 400);
  assert.equal(h.v2.motivationView(h.profile).preferences.nextGoal, 2);
  assert.equal(h.v2.motivationView(h.profile).lifetimePracticeXP, 0);
});
