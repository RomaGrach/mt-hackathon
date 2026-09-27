import { canonical, comparisonManifest, contentHash } from './shift-content.js';
import { assertV2 } from './v2-validation.js';
const DAY = 86400000,
  VERSION = 'gamification-1';
export const dateKey = (now) =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now));
export function practiceWeek(now) {
  const local = new Date(dateKey(now) + 'T00:00:00Z');
  local.setUTCDate(local.getUTCDate() - ((local.getUTCDay() + 6) % 7));
  const start = Date.parse(local.toISOString().slice(0, 10) + 'T00:00:00+03:00');
  return {
    id: 'v2-' + local.toISOString().slice(0, 10),
    start,
    end: start + 7 * DAY,
    zone: 'Europe/Moscow',
  };
}
const nextDate = (date, days) =>
  new Date(Date.parse(date + 'T12:00:00Z') + days * DAY).toISOString().slice(0, 10);
export const PRACTICE_AWARDS = [
  { id: 'first-step', title: 'Первый рейс', description: 'Первый успешный полный учебный рейс' },
  {
    id: 'safe-hands',
    title: 'Надёжные руки',
    description: 'Полный зачёт с безопасностью не ниже 90',
  },
  {
    id: 'recovery',
    title: 'Работа над ошибками',
    description: 'После незачёта — полный успешный рейс того же семейства',
  },
  {
    id: 'own-rhythm',
    title: 'Свой ритм',
    description: 'Личная цель выполнена в двух разных неделях',
  },
];
const decode = (row) =>
  row
    ? {
        ...row,
        manifest: JSON.parse(row.manifest),
        archive: row.archive ? JSON.parse(row.archive) : null,
      }
    : null;
export function qualityPoints(result) {
  assertV2(
    Array.isArray(result.criteria) && result.criteria.length > 0,
    'INVALID_RUBRIC',
    'Рубрика не опубликована.',
    503
  );
  const ids = new Set();
  let earned = 0,
    possible = 0;
  for (const c of result.criteria) {
    assertV2(!ids.has(c.id), 'INVALID_RUBRIC', 'Повтор критерия.', 503);
    ids.add(c.id);
    if (c.status === 'not_assessed') {
      assertV2(
        c.earned === null && c.possible === null,
        'INVALID_RUBRIC',
        'Некорректная адаптация.',
        503
      );
      continue;
    }
    assertV2(
      c.status === 'assessed' &&
        Number.isInteger(c.earned) &&
        Number.isInteger(c.possible) &&
        c.possible > 0 &&
        c.earned >= 0 &&
        c.earned <= c.possible,
      'INVALID_RUBRIC',
      'Некорректные единицы оценки.',
      503
    );
    earned += c.earned;
    possible += c.possible;
  }
  assertV2(possible > 0, 'INVALID_RUBRIC', 'Нет оцениваемых критериев.', 503);
  return Math.floor((100 * earned) / possible);
}
/** All methods run within their caller's BEGIN IMMEDIATE transaction. */
export class Motivation {
  constructor(store, getContent) {
    this.store = store;
    this.getContent = getContent;
  }
  notice(profile, key, kind, title, body, now, target = null) {
    this.store.run(
      'INSERT OR IGNORE INTO notices VALUES(?,?,?,?,?,?,NULL,?)',
      profile + ':v2:' + key,
      profile,
      kind,
      title,
      body,
      now,
      target
    );
  }
  completedPeriods(profile) {
    return this.store.get(
      "SELECT COUNT(*) AS n FROM motivation_entries e JOIN motivation_periods p ON p.id=e.period_id WHERE e.profile_id=? AND e.active=1 AND p.state='archived'",
      profile
    ).n;
  }
  settle(now) {
    for (const row of this.store.all(
      "SELECT * FROM motivation_periods WHERE state='open' AND end_at<=? ORDER BY end_at",
      now
    )) {
      const entries = this.store.all('SELECT * FROM motivation_entries WHERE period_id=?', row.id);
      for (const entry of entries) {
        const active =
          this.store.get(
            'SELECT COUNT(*) AS n FROM competition_attempts WHERE profile_id=? AND period_id=? AND finished=1 AND technical=0',
            entry.profile_id,
            row.id
          ).n > 0;
        this.store.run(
          'UPDATE motivation_entries SET active=? WHERE profile_id=? AND period_id=?',
          Number(active),
          entry.profile_id,
          row.id
        );
        if (active && entry.band === 'returning')
          this.store.run(
            'UPDATE practice_accounts SET return_pending=0,consumed_gap_at=return_gap_at WHERE profile_id=?',
            entry.profile_id
          );
      }
      const visible = entries
        .filter((e) => e.opt_in && e.score > 0)
        .map((e) => ({
          profileId: e.profile_id,
          score: e.score,
          band: e.band,
          organization: JSON.parse(e.organization),
        }));
      for (const person of visible) {
        person.ranks = {};
        person.populations = {};
        for (const scope of ['crew', 'depot', 'company']) {
          const group = visible.filter(
            (x) => x.band === person.band && x.organization[scope] === person.organization[scope]
          );
          person.populations[scope] = group.length;
          person.ranks[scope] =
            group.length < 5 ? null : 1 + group.filter((x) => x.score > person.score).length;
        }
      }
      this.store.run(
        "UPDATE motivation_periods SET state='archived',archive=? WHERE id=? AND state='open'",
        JSON.stringify({
          closedAt: row.end_at,
          manifest: JSON.parse(row.manifest),
          entries: visible,
        }),
        row.id
      );
    }
  }
  period(now) {
    this.settle(now);
    const week = practiceWeek(now);
    let row = this.store.get('SELECT * FROM motivation_periods WHERE id=?', week.id);
    if (!row) {
      const c = this.getContent();
      const manifest = {
        id: 'one-shift-' + week.id + '-' + contentHash(c).slice(0, 12),
        slotId: 'shift',
        creditFamilyId: c.creditFamilyId,
        comparison: comparisonManifest(c),
        maxScore: 100,
      };
      this.store.run(
        "INSERT INTO motivation_periods VALUES(?,?,?,?, 'open',NULL)",
        week.id,
        week.start,
        week.end,
        JSON.stringify(manifest)
      );
      row = this.store.get('SELECT * FROM motivation_periods WHERE id=?', week.id);
    }
    return decode(row);
  }
  account(profile, now, touch = false) {
    const sunday = new Date(dateKey(now) + 'T12:00:00Z').getUTCDay() === 0;
    this.store.run(
      'INSERT OR IGNORE INTO practice_accounts(profile_id,first_visit_at,last_visit_at,visit_id,next_goal) VALUES(?,?,?,?,?)',
      profile,
      now,
      now,
      now,
      sunday ? 1 : 2
    );
    let a = this.store.get('SELECT * FROM practice_accounts WHERE profile_id=?', profile);
    const gap = a.last_practice_at ?? a.first_visit_at;
    if (
      this.completedPeriods(profile) >= 2 &&
      now - gap >= 28 * DAY &&
      gap !== (a.consumed_gap_at ?? -1) &&
      !a.return_pending
    ) {
      this.store.run(
        'UPDATE practice_accounts SET return_pending=1,return_gap_at=? WHERE profile_id=?',
        gap,
        profile
      );
      a = { ...a, return_pending: 1, return_gap_at: gap };
    }
    if (touch) {
      const visit = now - a.last_visit_at >= 30 * 60000 ? now : a.visit_id;
      this.store.run(
        'UPDATE practice_accounts SET last_visit_at=?,visit_id=? WHERE profile_id=?',
        now,
        visit,
        profile
      );
      a = { ...a, last_visit_at: now, visit_id: visit };
    }
    return a;
  }
  goal(profile, period, a) {
    this.store.run(
      'INSERT OR IGNORE INTO practice_goals VALUES(?,?,?,?,0,?)',
      profile,
      period.id,
      a.return_pending ? 1 : a.next_goal,
      '[]',
      a.paused
    );
    const g = this.store.get(
      'SELECT * FROM practice_goals WHERE profile_id=? AND period_id=?',
      profile,
      period.id
    );
    return {
      target: g.target,
      days: JSON.parse(g.days),
      completed: !!g.completed,
      paused: !!g.paused,
    };
  }
  entryView(profile, period) {
    const e = this.store.get(
      'SELECT * FROM motivation_entries WHERE profile_id=? AND period_id=?',
      profile,
      period.id
    );
    const used = this.store.get(
      'SELECT COUNT(*) AS n FROM competition_attempts WHERE profile_id=? AND period_id=?',
      profile,
      period.id
    ).n;
    return {
      optIn: !!e?.opt_in,
      band: e?.band || null,
      attemptsUsed: used,
      attemptsRemaining: Math.max(0, 2 - used),
      seasonPoints: e?.score || 0,
      state: !e
        ? 'not_joined'
        : !e.opt_in
          ? 'withdrawn'
          : period.state === 'archived'
            ? 'expired'
            : used === 2
              ? 'completed'
              : used
                ? 'active'
                : 'joined',
    };
  }
  join(profile, periodId, action, now) {
    const p = this.period(now);
    const a = this.account(profile, now, true);
    if (periodId !== p.id && action === 'withdraw') {
      const old = this.store.get('SELECT * FROM motivation_periods WHERE id=?', periodId);
      assertV2(old?.state === 'archived', 'PERIOD_CLOSED', 'Неделя недоступна.', 409);
      this.store.run(
        'UPDATE motivation_entries SET opt_in=0 WHERE profile_id=? AND period_id=?',
        profile,
        periodId
      );
      return this.entryView(profile, { id: periodId, state: 'archived' });
    }
    assertV2(
      periodId === p.id && p.state === 'open',
      'PERIOD_CLOSED',
      'Неделя уже завершена.',
      409
    );
    assertV2(['join', 'withdraw'].includes(action), 'INVALID_ENTRY', 'Выберите join или withdraw.');
    let e = this.store.get(
      'SELECT * FROM motivation_entries WHERE profile_id=? AND period_id=?',
      profile,
      p.id
    );
    if (!e && action === 'join') {
      const identity = this.store.get(
        'SELECT alias,crew,depot,company FROM profiles WHERE id=?',
        profile
      );
      const band =
        this.completedPeriods(profile) < 2 ? 'starter' : a.return_pending ? 'returning' : 'main';
      this.store.run(
        'INSERT INTO motivation_entries(profile_id,period_id,band,organization,opt_in,joined_at) VALUES(?,?,?,?,1,?)',
        profile,
        p.id,
        band,
        JSON.stringify(identity),
        now
      );
    } else if (e)
      this.store.run(
        'UPDATE motivation_entries SET opt_in=? WHERE profile_id=? AND period_id=?',
        Number(action === 'join'),
        profile,
        p.id
      );
    return this.entryView(profile, p);
  }
  reserve(profile, s, now) {
    if (!s.competition) return null;
    const p = this.period(now),
      entry = this.entryView(profile, p);
    assertV2(
      p.id === s.competition.periodId && p.state === 'open',
      'PERIOD_CLOSED',
      'Соревновательная неделя завершилась.',
      409
    );
    assertV2(entry.optIn, 'OPT_IN_REQUIRED', 'Сначала подтвердите добровольное участие.', 409);
    assertV2(
      s.mode === 'assessment' &&
        !s.origin &&
        canonical(s.comparisonGroup) === canonical(p.manifest.comparison),
      'PACK_MISMATCH',
      'Параметры попытки не совпадают с пакетом.',
      409
    );
    const old = this.store.get('SELECT ordinal FROM competition_attempts WHERE run_id=?', s.id);
    if (old) return old.ordinal;
    assertV2(
      entry.attemptsUsed < 2,
      'ATTEMPTS_EXHAUSTED',
      'Две соревновательные попытки использованы. Обучение остаётся доступным.',
      409
    );
    const ordinals = this.store
      .all(
        'SELECT ordinal FROM competition_attempts WHERE profile_id=? AND period_id=? AND slot_id=?',
        profile,
        p.id,
        p.manifest.slotId
      )
      .map((x) => x.ordinal);
    const ordinal = [1, 2].find((n) => !ordinals.includes(n));
    this.store.run(
      'INSERT INTO competition_attempts(run_id,profile_id,period_id,slot_id,ordinal) VALUES(?,?,?,?,?)',
      s.id,
      profile,
      p.id,
      p.manifest.slotId,
      ordinal
    );
    return ordinal;
  }
  award(profile, id, evidence, now) {
    return (
      this.store.run(
        'INSERT OR IGNORE INTO practice_awards VALUES(?,?,?,?,?)',
        profile,
        id,
        VERSION,
        now,
        JSON.stringify(evidence)
      ).changes > 0
    );
  }
  recordResult(profile, s) {
    const r = s.result,
      now = r.acceptedAt;
    const points = qualityPoints(r);
    const attempt = this.store.get('SELECT * FROM competition_attempts WHERE run_id=?', s.id);
    let eligible = false,
      reason = 'not_competitive';
    if (attempt) {
      const p = decode(
        this.store.get('SELECT * FROM motivation_periods WHERE id=?', attempt.period_id)
      );
      const e = this.store.get(
        'SELECT * FROM motivation_entries WHERE profile_id=? AND period_id=?',
        profile,
        p.id
      );
      reason =
        now < p.start_at || now >= p.end_at || p.state !== 'open'
          ? 'period_closed'
          : !e?.opt_in
            ? 'withdrawn'
            : s.mode !== 'assessment' || s.origin
              ? 'practice'
              : !r.passed || r.criticalError
                ? 'not_passed'
                : r.technicalIssue
                  ? 'technical_issue'
                  : r.hasHints || r.hasPause
                    ? 'assisted'
                    : canonical(r.comparisonGroup) !== canonical(p.manifest.comparison)
                      ? 'pack_mismatch'
                      : null;
      eligible = reason === null;
      this.store.run(
        'UPDATE competition_attempts SET score=?,finished=?,technical=? WHERE run_id=?',
        eligible ? points : 0,
        Number(s.status === 'completed' && now >= p.start_at && now < p.end_at),
        Number(r.technicalIssue),
        s.id
      );
      const best =
        this.store.get(
          'SELECT MAX(score) AS n FROM competition_attempts WHERE profile_id=? AND period_id=? AND technical=0',
          profile,
          p.id
        ).n || 0;
      this.store.run(
        'UPDATE motivation_entries SET score=? WHERE profile_id=? AND period_id=?',
        best,
        profile,
        p.id
      );
    }
    r.rankingEligible = eligible;
    r.rankingIneligibleReason = reason;
    r.seasonPoints = eligible ? points : 0;
    const earned = [];
    if (r.passed && !r.origin && !r.technicalIssue) {
      if (this.award(profile, 'first-step', { runId: s.id, mode: r.mode }, now))
        earned.push('Первый рейс');
      if (
        r.scales.safety >= 90 &&
        this.award(profile, 'safe-hands', { runId: s.id, mode: r.mode }, now)
      )
        earned.push('Надёжные руки');
      const prev = this.store
        .all(
          'SELECT run_id,document FROM results WHERE profile_id=? AND run_id<>? ORDER BY id',
          profile,
          s.id
        )
        .map((x) => ({ ...JSON.parse(x.document), runId: x.run_id }))
        .find(
          (x) =>
            x.schemaVersion === 2 &&
            x.creditFamilyId === r.creditFamilyId &&
            !x.passed &&
            !x.origin &&
            !x.technicalIssue &&
            !x.reasons?.includes('aborted')
        );
      if (
        prev &&
        this.award(profile, 'recovery', { failedRunId: prev.runId, passedRunId: s.id }, now)
      )
        earned.push('Работа над ошибками');
    }
    if (earned.length)
      this.notice(
        profile,
        'awards:' + s.id,
        'achievement',
        'Достижения за смену',
        earned.join(' · ') + '. Это игровые награды, не профессиональная квалификация.',
        now
      );
    return r;
  }
  preferences(profile, body, now) {
    const p = this.period(now),
      a = this.account(profile, now, true),
      g = this.goal(profile, p, a);
    if (body.goalDays !== undefined) {
      assertV2([1, 2, 3].includes(body.goalDays), 'INVALID_GOAL', 'Цель: 1, 2 или 3 дня.');
      this.store.run(
        'UPDATE practice_accounts SET next_goal=? WHERE profile_id=?',
        body.goalDays,
        profile
      );
      if (!g.completed && (!g.days.length || body.goalDays >= g.target))
        this.store.run(
          'UPDATE practice_goals SET target=? WHERE profile_id=? AND period_id=?',
          body.goalDays,
          profile,
          p.id
        );
    }
    for (const [field, column] of [
      ['paused', 'paused'],
      ['automaticNotices', 'automatic_notices'],
    ])
      if (body[field] !== undefined) {
        assertV2(
          typeof body[field] === 'boolean',
          'INVALID_PREFERENCE',
          'Настройка должна быть true или false.'
        );
        this.store.run(
          'UPDATE practice_accounts SET ' + column + '=? WHERE profile_id=?',
          Number(body[field]),
          profile
        );
        if (field === 'paused')
          this.store.run(
            'UPDATE practice_goals SET paused=? WHERE profile_id=? AND period_id=?',
            Number(body[field]),
            profile,
            p.id
          );
      }
    return this.view(profile, now, false);
  }
  ack(profile, r, now) {
    const p = this.period(now),
      a = this.account(profile, now, true);
    const old = this.store.get(
      'SELECT receipt FROM debrief_acks WHERE profile_id=? AND run_id=?',
      profile,
      r.runId
    );
    if (old)
      return {
        ...JSON.parse(old.receipt),
        deltaXP: 0,
        alreadyAcknowledged: true,
        noAdditionalXP: true,
      };
    const useful = !r.reasons.includes('aborted') && !r.technicalIssue && r.decisionCount > 0;
    let gain = 0,
      credit = 0,
      goalCompleted = false;
    if (useful) {
      const desired = r.origin ? 10 : 20;
      const row = this.store.get(
        'SELECT amount FROM practice_credits WHERE profile_id=? AND period_id=? AND family_id=?',
        profile,
        p.id,
        r.creditFamilyId
      );
      const count = this.store.get(
        'SELECT COUNT(*) AS n FROM practice_credits WHERE profile_id=? AND period_id=?',
        profile,
        p.id
      ).n;
      credit = row?.amount || 0;
      if (row || count < 5) {
        credit = Math.max(credit, desired);
        gain = credit - (row?.amount || 0);
        this.store.run(
          'INSERT INTO practice_credits VALUES(?,?,?,?) ON CONFLICT(profile_id,period_id,family_id) DO UPDATE SET amount=excluded.amount',
          profile,
          p.id,
          r.creditFamilyId,
          credit
        );
      }
      this.store.run(
        'UPDATE practice_accounts SET xp=xp+?,last_practice_at=MAX(COALESCE(last_practice_at,0),?) WHERE profile_id=?',
        gain,
        r.completedAt,
        profile
      );
      const g = this.goal(profile, p, a);
      if (practiceWeek(r.completedAt).id === p.id && !g.paused) {
        const days = [...new Set([...g.days, dateKey(r.completedAt)])].sort();
        goalCompleted = g.completed || days.length >= g.target;
        this.store.run(
          'UPDATE practice_goals SET days=?,completed=? WHERE profile_id=? AND period_id=?',
          JSON.stringify(days),
          Number(goalCompleted),
          profile,
          p.id
        );
        if (
          goalCompleted &&
          this.store.get(
            'SELECT COUNT(*) AS n FROM practice_goals WHERE profile_id=? AND completed=1',
            profile
          ).n >= 2
        )
          this.award(
            profile,
            'own-rhythm',
            {
              periodIds: this.store
                .all(
                  'SELECT period_id FROM practice_goals WHERE profile_id=? AND completed=1 ORDER BY period_id',
                  profile
                )
                .map((x) => x.period_id),
            },
            now
          );
      }
      this.review(profile, r, now);
    }
    const xp = this.store.get('SELECT xp FROM practice_accounts WHERE profile_id=?', profile).xp;
    const response = {
      runId: r.runId,
      acknowledged: true,
      alreadyAcknowledged: false,
      deltaXP: gain,
      noAdditionalXP: gain === 0,
      weeklyFamilyCredit: credit,
      lifetimePracticeXP: xp,
      practiceLevel: 1 + Math.floor(xp / 100),
      goalCompleted,
    };
    this.store.run(
      'INSERT INTO debrief_acks VALUES(?,?,?,?,?)',
      profile,
      r.runId,
      p.id,
      now,
      JSON.stringify(response)
    );
    return response;
  }
  review(profile, r, now) {
    const old = this.store.get(
      "SELECT * FROM practice_reviews WHERE profile_id=? AND family_id=? AND status='open'",
      profile,
      r.creditFamilyId
    );
    const missed = r.criteria.filter((c) => c.status === 'assessed' && c.earned < c.possible);
    const target = r.criticalError
      ? 'timely-safety'
      : (missed.find((c) => c.mandatory) || missed[0])?.id || null;
    const previous = old
      ? this.store.get('SELECT document FROM results WHERE run_id=?', old.origin_run_id)
      : null;
    const oldResult = previous ? JSON.parse(previous.document) : null;
    const priority = (result, id) =>
      result?.criticalError
        ? 0
        : result?.criteria.some((c) => c.id === id && c.mandatory)
          ? 1
          : id
            ? 2
            : 3;
    const repaired =
      old?.criterion_id &&
      r.criteria.some(
        (c) => c.id === old.criterion_id && c.status === 'assessed' && c.earned === c.possible
      ) &&
      r.freshCriterionIds.includes(old.criterion_id) &&
      !r.criticalError;
    if (
      old &&
      old.criterion_id &&
      !repaired &&
      priority(oldResult, old.criterion_id) <= priority(r, target)
    )
      return;
    const nextVariant =
      r.variantId === 'blocked-aisle' ? 'clear-aisle-service-check' : 'blocked-aisle';
    const due = nextDate(dateKey(r.completedAt), r.passed && !target ? 7 : 1);
    this.store.run(
      'INSERT INTO practice_reviews VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(profile_id,family_id) DO UPDATE SET status=excluded.status,due_date=excluded.due_date,criterion_id=excluded.criterion_id,origin_run_id=excluded.origin_run_id,variant_id=excluded.variant_id,created_at=excluded.created_at,updated_at=excluded.updated_at',
      profile,
      r.creditFamilyId,
      'open',
      due,
      target,
      r.runId,
      target === 'timely-safety' ? 'blocked-aisle' : nextVariant,
      now,
      now
    );
    this.store.run(
      'INSERT INTO motivation_events(profile_id,run_id,kind,at,data) VALUES(?,?,?,?,?)',
      profile,
      r.runId,
      'review_updated',
      now,
      JSON.stringify({
        repaired: !!repaired,
        previousCriterion: old?.criterion_id || null,
        criterion: target,
        previousRunId: old?.origin_run_id || null,
        dueDate: due,
      })
    );
    if (repaired)
      this.notice(
        profile,
        'review-repaired:' + r.runId,
        'achievement',
        'Учебная ошибка исправлена',
        'Целевой критерий выполнен в новой практике. Дополнительных соревновательных очков за исправление нет.',
        now
      );
  }
  view(profile, now, touch = true) {
    const p = this.period(now),
      a = this.account(profile, now, touch),
      g = this.goal(profile, p, a),
      entry = this.entryView(profile, p);
    const c = this.getContent();
    this.notice(
      profile,
      'new:' + c.id + ':' + c.version,
      'scenario',
      'Полноценная учебная смена',
      'Приёмка, несколько дел и причинный разбор. Класс выбирается перед началом.',
      now,
      'shift:' + c.id
    );
    this.notice(
      profile,
      'challenge:' + p.id,
      'challenge',
      'Личная цель и добровольное соревнование',
      'Один сопоставимый сценарий, две попытки и максимум 100 СП за неделю. Практика доступна без рейтинга.',
      now
    );
    if (entry.seasonPoints > 0 && p.end_at - now <= 2 * DAY && now < p.end_at)
      this.notice(
        profile,
        'expiry:' + p.id,
        'expiry',
        'Срок сезонных очков',
        entry.seasonPoints +
          ' СП перестанут быть активными после конца недели по Москве. Итог сохранится; XP, уровень и история не сгорают.',
        now
      );
    const review = this.store.get(
      "SELECT * FROM practice_reviews WHERE profile_id=? AND status='open' ORDER BY CASE WHEN criterion_id='timely-safety' THEN 0 WHEN criterion_id IS NOT NULL THEN 1 ELSE 2 END,created_at,family_id LIMIT 1",
      profile
    );
    if (review && review.due_date <= dateKey(now) && !a.paused)
      this.notice(
        profile,
        'review:' + review.family_id + ':' + review.due_date,
        'review',
        'Следующая практика',
        'Повторите ситуацию и проверьте выбранный критерий. За ошибку не начисляется отдельный бонус.',
        now,
        'shift:' + c.id
      );
    let automaticNotice = null;
    const active = this.store.get(
      "SELECT id FROM runs WHERE profile_id=? AND phase<>'result' LIMIT 1",
      profile
    );
    if (
      touch &&
      !active &&
      !a.paused &&
      a.automatic_notices &&
      !this.store.get(
        'SELECT 1 FROM motivation_notice_views WHERE profile_id=? AND visit_id=?',
        profile,
        a.visit_id
      ) &&
      this.store.get(
        'SELECT COUNT(*) AS n FROM motivation_notice_views WHERE profile_id=? AND period_id=?',
        profile,
        p.id
      ).n < 3
    ) {
      const notice = this.store
        .all(
          'SELECT id,kind,title,body FROM notices WHERE profile_id=? AND read_at IS NULL ORDER BY at DESC',
          profile
        )
        .filter(
          (n) =>
            n.id.startsWith(profile + ':v2:') &&
            ['expiry', 'scenario', 'challenge', 'review'].includes(n.kind) &&
            (n.kind !== 'expiry' ||
              (n.id === profile + ':v2:expiry:' + p.id &&
                now < p.end_at &&
                entry.seasonPoints > 0)) &&
            (n.kind !== 'challenge' || n.id === profile + ':v2:challenge:' + p.id) &&
            (n.kind !== 'review' ||
              (review &&
                n.id === profile + ':v2:review:' + review.family_id + ':' + review.due_date))
        )
        .sort(
          (x, y) =>
            ['expiry', 'scenario', 'challenge', 'review'].indexOf(x.kind) -
            ['expiry', 'scenario', 'challenge', 'review'].indexOf(y.kind)
        )[0];
      if (notice) {
        automaticNotice = notice;
        this.store.run(
          'INSERT INTO motivation_notice_views VALUES(?,?,?,?,?)',
          profile,
          p.id,
          a.visit_id,
          notice.id,
          now
        );
      }
    }
    const results = this.store
      .all('SELECT document FROM results WHERE profile_id=? ORDER BY id DESC LIMIT 100', profile)
      .map((x) => JSON.parse(x.document))
      .filter((r) => r.schemaVersion === 2 && r.engineVersion !== 'shift-4');
    const groups = new Map();
    for (const r of results) {
      const key = canonical({ comparison: r.comparisonGroup, mode: r.mode });
      if (!groups.has(key))
        groups.set(key, {
          runId: r.runId,
          at: r.completedAt,
          mode: r.mode,
          variantId: r.variantId,
          timingPolicy: r.timingPolicy,
          servicePolicyId: r.comparisonGroup.servicePolicyId,
          criteria: r.criteria,
        });
    }
    return {
      schemaVersion: 2,
      gamificationVersion: VERSION,
      serverNow: now,
      notForEmploymentDecisions: true,
      lifetimePracticeXP: a.xp,
      practiceLevel: 1 + Math.floor(a.xp / 100),
      levelProgress: a.xp % 100,
      weeklyXP: this.store.get(
        'SELECT COALESCE(SUM(amount),0) AS n FROM practice_credits WHERE profile_id=? AND period_id=?',
        profile,
        p.id
      ).n,
      actualWeeklyFamilyMaximum: 20,
      period: {
        id: p.id,
        state: p.state,
        startAt: p.start_at,
        endAt: p.end_at,
        zone: 'Europe/Moscow',
        packId: p.manifest.id,
        slotId: p.manifest.slotId,
        maxScore: 100,
        scenarioId: p.manifest.comparison.scenarioId,
        timingPolicy: p.manifest.comparison.timingPolicy,
      },
      participation: entry,
      goal: g,
      preferences: {
        nextGoal: a.next_goal,
        paused: !!a.paused,
        automaticNotices: !!a.automatic_notices,
      },
      returnPending: !!a.return_pending,
      successfulWeeks: this.store.get(
        'SELECT COUNT(*) AS n FROM practice_goals WHERE profile_id=? AND completed=1',
        profile
      ).n,
      nextReview: review
        ? {
            familyId: review.family_id,
            dueDate: review.due_date,
            criterionId: review.criterion_id,
            originRunId: review.origin_run_id,
            variantId: review.variant_id,
            sameContext:
              review.variant_id ===
              results.find((r) => r.runId === review.origin_run_id)?.variantId,
          }
        : null,
      awards: this.store
        .all(
          'SELECT achievement_id AS id,at,evidence FROM practice_awards WHERE profile_id=? ORDER BY at,id',
          profile
        )
        .map((x) => ({ ...x, evidence: JSON.parse(x.evidence) })),
      awardRules: PRACTICE_AWARDS,
      evidence: [...groups.values()],
      history: results.map((r) => ({
        runId: r.runId,
        title: r.title,
        passed: r.passed,
        at: r.completedAt,
        mode: r.mode,
        variantId: r.variantId,
        serviceClass: r.comparisonGroup.servicePolicyId.split('-')[0],
        timingPolicyId: r.timingPolicy.id,
        episodePoints: r.episodePoints,
        possibleEpisodePoints: r.possibleEpisodePoints,
        criticalError: r.criticalError,
        origin: r.origin,
      })),
      archives: this.store.all(
        "SELECT e.period_id,e.score,e.band,p.end_at FROM motivation_entries e JOIN motivation_periods p ON p.id=e.period_id WHERE e.profile_id=? AND p.state='archived' ORDER BY p.end_at DESC LIMIT 12",
        profile
      ),
      automaticNotice,
    };
  }
  leaders(profile, scope, periodId, offset = 0, limit = 50, now) {
    assertV2(
      ['crew', 'depot', 'company'].includes(scope),
      'INVALID_SCOPE',
      'scope: crew, depot или company.'
    );
    assertV2(
      Number.isInteger(offset) &&
        offset >= 0 &&
        Number.isInteger(limit) &&
        limit >= 1 &&
        limit <= 50,
      'INVALID_QUERY',
      'Неверная страница рейтинга.'
    );
    const current = this.period(now),
      p = periodId
        ? decode(this.store.get('SELECT * FROM motivation_periods WHERE id=?', periodId))
        : current;
    assertV2(p, 'NOT_FOUND', 'Период не найден.', 404);
    const e = this.store.get(
      'SELECT * FROM motivation_entries WHERE profile_id=? AND period_id=?',
      profile,
      p.id
    );
    if (!e)
      return {
        schemaVersion: 2,
        scope,
        periodId: p.id,
        optIn: false,
        insufficientParticipants: true,
        total: 0,
        rows: [],
        me: { score: 0, rank: null },
        offset,
        limit,
        maxScore: 100,
      };
    const org = JSON.parse(e.organization);
    const entries = p.archive
      ? p.archive.entries
      : this.store
          .all('SELECT * FROM motivation_entries WHERE period_id=? AND opt_in=1 AND score>0', p.id)
          .map((x) => ({
            profileId: x.profile_id,
            score: x.score,
            band: x.band,
            organization: JSON.parse(x.organization),
          }));
    const ownArchive = p.archive?.entries.find((x) => x.profileId === profile);
    const peers = entries
      .filter(
        (x) =>
          x.band === e.band &&
          x.organization[scope] === org[scope] &&
          (!p.archive ||
            this.store.get(
              'SELECT opt_in FROM motivation_entries WHERE profile_id=? AND period_id=?',
              x.profileId,
              p.id
            )?.opt_in)
      )
      .sort((a, b) => b.score - a.score || (a.profileId < b.profileId ? -1 : 1));
    const frozenPopulation =
      ownArchive?.populations?.[scope] ??
      entries.find((x) => x.band === e.band && x.organization[scope] === org[scope])?.populations?.[
        scope
      ];
    const insufficient = p.archive ? (frozenPopulation ?? 0) < 5 : peers.length < 5;
    const rank = (score) => 1 + peers.filter((x) => x.score > score).length;
    const rows = insufficient
      ? []
      : peers.slice(offset, offset + limit).map((x) => ({
          name: x.organization.alias,
          score: x.score,
          rank: p.archive ? x.ranks[scope] : rank(x.score),
          me: x.profileId === profile,
        }));
    return {
      schemaVersion: 2,
      scope,
      periodId: p.id,
      group: org[scope],
      band: e.band,
      optIn: !!e.opt_in,
      insufficientParticipants: insufficient,
      total: peers.length,
      rows,
      me: {
        name: org.alias,
        score: e.score,
        rank:
          !insufficient && e.opt_in && e.score > 0
            ? p.archive
              ? (ownArchive?.ranks?.[scope] ?? null)
              : rank(e.score)
            : null,
      },
      offset,
      limit,
      hasMore: !insufficient && offset + limit < peers.length,
      maxScore: 100,
      archived: p.state === 'archived',
    };
  }
}
