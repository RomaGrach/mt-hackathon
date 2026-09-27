import { DESIGN002_CONTENT, validateDesign002 } from './design002-content.js';
import { competencyProfile, competencyLeaders } from './design002-progress.js';
import { randomUUID } from 'node:crypto';
import { GameError } from './engine.js';
import { SHIFT_CONTENT, canonical, contentHash, validateShiftContent } from './shift-content.js';
import { createShift, reduceShift, expireShift, publicShiftState } from './shift-runtime.js';
import { Motivation, qualityPoints } from './motivation.js';
import { assertV2, objectFields, requestKey, validateCommand } from './v2-validation.js';
const rulesHash = (c) =>
  c.engineVersion === 'shift-4'
    ? contentHash(c)
    : contentHash({
        engineVersion: c.engineVersion,
        rulesVersion: c.rulesVersion,
        rubric: c.rubric,
        effects: c.effects,
        thresholds: c.thresholds,
        timingPolicies: c.timingPolicies,
      });
export function publishShiftContent(store, c, now) {
  const errors = c.engineVersion === 'shift-4' ? validateDesign002(c) : validateShiftContent(c);
  assertV2(!errors.length, 'INVALID_CONTENT', errors.join('; '), 400);
  const hash = contentHash(c),
    rules = rulesHash(c);
  return store.transaction(() => {
    const old = store.get(
      'SELECT document FROM scenarios WHERE id=? AND version=?',
      c.id,
      c.version
    );
    assertV2(
      !old || contentHash(JSON.parse(old.document)) === hash,
      'IMMUTABLE_CONTENT',
      'Опубликованная версия неизменяема: увеличьте version.',
      409
    );
    store.run(
      'INSERT OR IGNORE INTO scenarios VALUES(?,?,?,?)',
      c.id,
      c.version,
      JSON.stringify(c),
      now
    );
    const inserted = store.run(
      'INSERT OR IGNORE INTO shift_publications VALUES(?,?,1,?,?,?)',
      c.id,
      c.version,
      hash,
      rules,
      now
    );
    if (inserted.changes)
      store.run(
        'INSERT INTO operator_audit(at,action,target,detail) VALUES(?,?,?,?)',
        now,
        'publish',
        c.id + '@' + c.version,
        JSON.stringify({ hash, rules, reviewStatus: c.reviewStatus })
      );
    return {
      scenarioId: c.id,
      contentVersion: c.version,
      contentHash: hash,
      published: !!inserted.changes,
    };
  });
}
export class ShiftService {
  constructor(store, { clock = Date.now, clockMode = 'elapsed', publishContent = true } = {}) {
    this.store = store;
    this.clock = clock;
    this.clockMode = clockMode;
    if (publishContent) {
      publishShiftContent(store, SHIFT_CONTENT, clock());
      publishShiftContent(store, DESIGN002_CONTENT, clock());
    }
    this.motivation = new Motivation(store, () => this.currentContent(false));
  }
  currentContent(enabled = true, scenarioId = SHIFT_CONTENT.id) {
    const row = this.store.get(
      'SELECT s.document FROM shift_publications p JOIN scenarios s ON s.id=p.scenario_id AND s.version=p.content_version WHERE p.scenario_id=?' +
        (enabled ? ' AND p.enabled=1' : '') +
        ' ORDER BY p.published_at DESC,p.content_version DESC LIMIT 1',
      scenarioId
    );
    assertV2(row, 'CONTENT_UNAVAILABLE', 'Опубликованная смена сейчас недоступна.', 503);
    return JSON.parse(row.document);
  }
  catalog() {
    const seen = new Set();
    return this.store
      .all(
        'SELECT s.document FROM shift_publications p JOIN scenarios s ON s.id=p.scenario_id AND s.version=p.content_version WHERE p.enabled=1 ORDER BY p.published_at DESC,p.content_version DESC'
      )
      .map((r) => JSON.parse(r.document))
      .filter((c) => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
      })
      .map((c) => ({
        engineVersion: c.engineVersion,
        id: c.id,
        version: c.version,
        title: c.title,
        classes: Object.entries(c.policies).map(([id, p]) => ({
          id,
          label: p.label,
          fact: p.fact,
        })),
        timingPolicies: Object.entries(c.timingPolicies).map(([id, durationMs]) => ({
          id,
          durationMs,
        })),
        trainingVariants: Object.values(c.variants).map((v) => ({
          id: v.id,
          label: v.label,
          turns: v.turns,
        })),
        reviewStatus: c.reviewStatus,
      }))
      .sort(
        (a, b) => Number(b.engineVersion === 'shift-4') - Number(a.engineVersion === 'shift-4')
      );
  }
  owns(profile, id) {
    const row = this.store.get('SELECT * FROM runs WHERE id=? AND profile_id=?', id, profile);
    assertV2(row, 'NOT_FOUND', 'Смена не найдена.', 404);
    return row;
  }
  load(profile, id) {
    const row = this.owns(profile, id),
      s = JSON.parse(row.state),
      meta = this.store.get('SELECT * FROM shift_meta WHERE run_id=?', id);
    assertV2(
      s.schemaVersion === 2 &&
        ['shift-2', 'shift-3', 'shift-4'].includes(s.engineVersion) &&
        meta?.engine_version === s.engineVersion &&
        meta.schema_version === 2,
      'UNSUPPORTED_RUN_VERSION',
      'Для этой попытки требуется другая версия движка.',
      503
    );
    const content = this.store.get(
      'SELECT document FROM scenarios WHERE id=? AND version=?',
      row.scenario_id,
      row.scenario_version
    );
    assertV2(content, 'CONTENT_VERSION_MISSING', 'Закреплённая версия содержания недоступна.', 503);
    const c = JSON.parse(content.document);
    assertV2(
      contentHash(c) === meta.content_hash && rulesHash(c) === meta.rules_hash,
      'CONTENT_INTEGRITY',
      'Закреплённое содержание изменено. Попытка не подменена новой версией.',
      503
    );
    const latest = this.store.get(
      'SELECT MAX(seq) AS seq FROM shift_events WHERE run_id=?',
      id
    ).seq;
    const initial = JSON.parse(meta.initial_state);
    assertV2(
      s.lastEventSeq === (latest ?? initial.lastEventSeq) && row.revision === s.revision,
      'CHECKPOINT_MISMATCH',
      'Нарушена последовательность сохранения.',
      503
    );
    return { s, c, meta, row };
  }
  noActive(profile) {
    assertV2(
      !this.store.get(
        "SELECT id FROM runs WHERE profile_id=? AND phase<>'result' LIMIT 1",
        profile
      ),
      'ACTIVE_RUN',
      'Сначала продолжите или завершите текущую попытку.',
      409
    );
  }
  execute(profile, key, signature, fn) {
    requestKey(key);
    return this.store.transaction(() => {
      const old = this.store.get(
        'SELECT signature,response FROM requests WHERE profile_id=? AND request_id=?',
        profile,
        key
      );
      if (old) {
        assertV2(
          old.signature === signature,
          'KEY_REUSED',
          'requestId уже использован с другим запросом.',
          409
        );
        return JSON.parse(old.response);
      }
      const now = this.clock();
      let response;
      try {
        response = fn(now);
      } catch (error) {
        if (!(error instanceof GameError)) throw error;
        response = {
          status: error.status,
          body: {
            error: { code: error.code, message: error.message },
            ...(error.currentRun ? { run: error.currentRun } : {}),
          },
        };
      }
      this.store.run(
        'INSERT INTO requests VALUES(?,?,?,?,?)',
        profile,
        key,
        signature,
        JSON.stringify(response),
        now
      );
      return response;
    });
  }
  view(s, c, now) {
    const view = publicShiftState(s, c, now);
    if (view.result) {
      const ack = this.store.get(
        'SELECT receipt FROM debrief_acks WHERE profile_id=? AND run_id=?',
        s.profileId,
        s.id
      );
      view.debrief = { acknowledged: !!ack, receipt: ack ? JSON.parse(ack.receipt) : null };
    }
    return view;
  }
  insert(profile, c, s, now) {
    const pub = this.store.get(
      'SELECT * FROM shift_publications WHERE scenario_id=? AND content_version=?',
      c.id,
      c.version
    );
    assertV2(pub?.enabled, 'CONTENT_DISABLED', 'Эта версия отключена для новых попыток.', 409);
    this.store.run(
      'INSERT INTO runs VALUES(?,?,?,?,?,?,?,?,?,?)',
      s.id,
      profile,
      c.id,
      c.version,
      JSON.stringify(s),
      s.phase,
      null,
      s.revision,
      now,
      now
    );
    this.store.run(
      'INSERT INTO shift_meta VALUES(?,?,?,?,?,?)',
      s.id,
      s.engineVersion,
      s.schemaVersion,
      pub.content_hash,
      pub.rules_hash,
      JSON.stringify(s)
    );
    return this.view(s, c, now);
  }
  start(profile, body) {
    requestKey(body?.requestId);
    return this.execute(profile, body.requestId, canonical(['v2/start', body]), (now) => {
      objectFields(
        body,
        [
          'requestId',
          'scenarioId',
          'mode',
          'timingPolicyId',
          'variantId',
          'serviceClass',
          'competitionSlotId',
        ],
        ['requestId', 'scenarioId', 'mode', 'timingPolicyId']
      );
      requestKey(body.requestId);
      assertV2(
        typeof body.scenarioId === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(body.scenarioId),
        'INVALID_SCENARIO',
        'Неверная смена.'
      );
      this.noActive(profile);
      let c = this.currentContent(true, body.scenarioId),
        variantId =
          body.variantId ?? (c.engineVersion === 'shift-4' ? 'orientation' : 'blocked-aisle'),
        competition = null;
      assertV2(
        body.variantId === undefined || body.mode === 'training' || c.engineVersion === 'shift-4',
        'VARIANT_NOT_ALLOWED',
        'Вариант оценочной попытки назначает сервер.'
      );
      if (body.mode === 'assessment' && !body.competitionSlotId && c.engineVersion !== 'shift-4') {
        const count = this.store.get(
          'SELECT COUNT(*) AS n FROM shift_meta m JOIN runs r ON r.id=m.run_id WHERE r.profile_id=?',
          profile
        ).n;
        variantId = Object.keys(c.variants)[count % Object.keys(c.variants).length];
      }
      if (body.competitionSlotId !== undefined) {
        const p = this.motivation.period(now);
        assertV2(
          body.competitionSlotId === p.manifest.slotId && body.mode === 'assessment',
          'INVALID_SLOT',
          'Недопустимый соревновательный слот.'
        );
        assertV2(
          this.motivation.entryView(profile, p).optIn,
          'OPT_IN_REQUIRED',
          'Сначала подтвердите добровольное участие.',
          409
        );
        const pinned = this.store.get(
          'SELECT document FROM scenarios WHERE id=? AND version=?',
          p.manifest.comparison.scenarioId,
          p.manifest.comparison.contentVersion
        );
        assertV2(pinned, 'CONTENT_VERSION_MISSING', 'Версия пакета недоступна.', 503);
        c = JSON.parse(pinned.document);
        variantId = p.manifest.comparison.variantId;
        competition = { periodId: p.id, slotId: p.manifest.slotId, ordinal: null };
      }
      const s = createShift(
        c,
        {
          id: randomUUID(),
          profileId: profile,
          mode: body.mode,
          timingPolicyId: body.timingPolicyId,
          variantId,
          serviceClass: body.serviceClass ?? 'standard',
          competition,
          clockMode: this.clockMode,
        },
        now
      );
      if (competition)
        assertV2(
          canonical(s.comparisonGroup) ===
            canonical(this.motivation.period(now).manifest.comparison),
          'PACK_MISMATCH',
          'Соревнование использует стандартный класс и стандартное время.',
          409
        );
      return { status: 201, body: this.insert(profile, c, s, now) };
    });
  }
  persist(profile, previous, next, c, command, now, key = null) {
    if (next.result && !this.store.get('SELECT 1 FROM results WHERE run_id=?', next.id)) {
      if (next.engineVersion !== 'shift-4') qualityPoints(next.result);
      if (next.engineVersion !== 'shift-4') this.motivation.recordResult(profile, next);
      this.store.run(
        'INSERT INTO results(run_id,profile_id,scenario_id,scenario_version,points,passed,practice,completed_at,document) VALUES(?,?,?,?,?,?,?,?,?)',
        next.id,
        profile,
        c.id,
        c.version,
        next.result.episodePoints,
        Number(next.result.passed),
        Number(next.mode === 'training'),
        next.finishedAt,
        JSON.stringify(next.result)
      );
    }
    const deadline = next.criticalWindow?.status === 'open' ? next.criticalWindow.deadline : null;
    this.store.run(
      'UPDATE runs SET state=?,phase=?,deadline=?,revision=?,updated_at=? WHERE id=? AND profile_id=?',
      JSON.stringify(next),
      next.phase,
      deadline,
      next.revision,
      now,
      next.id,
      profile
    );
    for (const e of next.log.filter((e) => e.seq > previous.lastEventSeq))
      this.store.run(
        'INSERT INTO shift_events VALUES(?,?,?,?)',
        next.id,
        e.seq,
        e.eventId,
        JSON.stringify(e)
      );
    this.store.run(
      'INSERT INTO shift_transitions VALUES(?,?,?,?,?,?)',
      next.id,
      next.revision,
      JSON.stringify({ command, competition: next.competition }),
      now,
      key,
      JSON.stringify(next)
    );
  }
  command(profile, id, body) {
    requestKey(body?.requestId);
    this.owns(profile, id);
    return this.execute(profile, body.requestId, canonical(['v2/commands', id, body]), (now) => {
      objectFields(body, ['requestId', 'revision', 'command']);
      validateCommand(body.command);
      assertV2(
        Number.isSafeInteger(body.revision) && body.revision >= 0,
        'INVALID_REVISION',
        'Нужна целая revision.'
      );
      const { s, c } = this.load(profile, id);
      now = Math.max(now, s.lastObservedServerAt);
      const expired = expireShift(s, c, now);
      if (expired !== s) {
        this.persist(profile, s, expired, c, { type: '_timeout' }, now);
        const error = new GameError(
          'DEADLINE_EXPIRED',
          'Срок истёк на сервере. Позднее действие не выполнено.',
          409
        );
        error.currentRun = this.view(expired, c, now);
        throw error;
      }
      assertV2(
        s.revision === body.revision,
        'STALE_REVISION',
        'Состояние изменилось. Обновите смену и выберите действие заново.',
        409
      );
      const next = reduceShift(s, body.command, c, now, body.requestId);
      if (body.command.type === 'begin' && next.competition)
        next.competition.ordinal = this.motivation.reserve(profile, next, now);
      this.persist(profile, s, next, c, body.command, now, body.requestId);
      return {
        status: 200,
        body: {
          receipt: { requestId: body.requestId, revision: next.revision, acceptedAt: now },
          run: this.view(next, c, now),
        },
      };
    });
  }
  get(profile, id) {
    return this.store.transaction(() => {
      const { s, c } = this.load(profile, id),
        now = Math.max(this.clock(), s.lastObservedServerAt),
        next = expireShift(s, c, now);
      if (next !== s) this.persist(profile, s, next, c, { type: '_timeout' }, now);
      else if (now > s.lastObservedServerAt && s.engineVersion !== 'shift-4') {
        s.lastObservedServerAt = now;
        this.store.run(
          'UPDATE runs SET state=? WHERE id=? AND profile_id=?',
          JSON.stringify(s),
          id,
          profile
        );
      }
      return this.view(next, c, now);
    });
  }
  result(profile, id) {
    const run = this.get(profile, id);
    assertV2(run.result, 'RESULT_NOT_READY', 'Смена ещё не завершена.', 409);
    return run.result;
  }
  exactReplay(profile, id) {
    return this.store.transaction(() => {
      const { s, c, meta } = this.load(profile, id);
      assertV2(s.result, 'RESULT_NOT_READY', 'Точный просмотр доступен после завершения.', 409);
      let restored = JSON.parse(meta.initial_state);
      const transitions = this.store.all(
        'SELECT * FROM shift_transitions WHERE run_id=? ORDER BY revision',
        id
      );
      for (const t of transitions) {
        const input = JSON.parse(t.input);
        restored.competition = input.competition;
        restored = reduceShift(restored, input.command, c, t.accepted_at, t.request_id);
      }
      const keys = [
        'passed',
        'reasons',
        'scales',
        'criticalErrors',
        'criteria',
        'episodePoints',
        'history',
        'completedAt',
        'mode',
        'timingPolicy',
        'variantId',
      ];
      assertV2(
        restored.result &&
          keys.every((k) => canonical(restored.result[k]) === canonical(s.result[k])),
        'REPLAY_MISMATCH',
        'Журнал не совпал с сохранённым результатом.',
        503
      );
      return {
        runId: id,
        verified: true,
        engineVersion: s.engineVersion,
        contentHash: meta.content_hash,
        transitions: transitions.length,
        result: s.result,
        rewardsIssued: false,
      };
    });
  }
  replay(profile, id, body) {
    requestKey(body?.requestId);
    this.owns(profile, id);
    return this.execute(profile, body.requestId, canonical(['v2/replay', id, body]), (now) => {
      objectFields(body, ['requestId', 'originEventSeq']);
      assertV2(
        Number.isSafeInteger(body.originEventSeq) && body.originEventSeq > 0,
        'INVALID_EVENT',
        'Выберите решение в истории.'
      );
      this.noActive(profile);
      const { s, c, meta } = this.load(profile, id);
      assertV2(s.result, 'RESULT_NOT_READY', 'Сначала завершите исходную смену.', 409);
      assertV2(
        s.engineVersion !== 'shift-4',
        'FULL_SHIFT_REQUIRED',
        'Начните новую полную смену с главной страницы.'
      );
      const row = this.store.get(
        'SELECT document FROM shift_events WHERE run_id=? AND seq=?',
        id,
        body.originEventSeq
      );
      assertV2(row, 'INVALID_EVENT', 'Решение не найдено.');
      const e = JSON.parse(row.document);
      assertV2(
        ['action', 'critical_timeout'].includes(e.type),
        'INVALID_EVENT',
        'Выберите рабочее решение, не служебное событие.'
      );
      const prior =
        e.revisionAfter === 1
          ? meta.initial_state
          : this.store.get(
              'SELECT checkpoint FROM shift_transitions WHERE run_id=? AND revision=?',
              id,
              e.revisionAfter - 1
            )?.checkpoint;
      assertV2(prior, 'CHECKPOINT_MISSING', 'Не найдено состояние до решения.', 503);
      const branch = JSON.parse(prior);
      Object.assign(branch, {
        id: randomUUID(),
        profileId: profile,
        mode: 'training',
        status: 'active',
        revision: 0,
        createdAt: now,
        updatedAt: now,
        lastObservedServerAt: now,
        finishedAt: null,
        result: null,
        decisionCount: 0,
        competition: null,
        origin: { runId: id, originEventSeq: body.originEventSeq },
        hasHints: false,
        hasPause: false,
        technicalIssue: false,
      });
      branch.log = branch.log.map((x) => ({ ...x, inherited: true }));
      if (branch.criticalWindow) {
        Object.assign(branch.criticalWindow, {
          status: 'pending',
          openedAt: null,
          deadline: null,
          remainingMs: null,
          activeElapsedMs: 0,
        });
        branch.phase = 'feedback';
        branch.resumeState = null;
        branch.feedback = {
          text: 'Новая учебная ветка. Предыдущие факты сохранены, срочная сцена откроется с полным учебным сроком после продолжения.',
          impact: { loyalty: 0, safety: 0 },
        };
      }
      return { status: 201, body: this.insert(profile, c, branch, now) };
    });
  }
  competencyView(profile) {
    return competencyProfile(this.store, profile);
  }
  competencyLeaders(profile, scope, offset, limit) {
    return competencyLeaders(this.store, profile, scope, offset, limit);
  }
  motivationView(profile, touch = true) {
    return this.store.transaction(() => this.motivation.view(profile, this.clock(), touch));
  }
  preferences(profile, body) {
    requestKey(body?.requestId);
    return this.execute(profile, body.requestId, canonical(['v2/preferences', body]), (now) => {
      objectFields(body, ['requestId', 'goalDays', 'paused', 'automaticNotices'], ['requestId']);
      if (body.goalDays !== undefined)
        assertV2([1, 2, 3].includes(body.goalDays), 'INVALID_GOAL', 'Цель: 1, 2 или 3 дня.');
      for (const k of ['paused', 'automaticNotices'])
        if (body[k] !== undefined)
          assertV2(
            typeof body[k] === 'boolean',
            'INVALID_PREFERENCE',
            'Настройка должна быть true или false.'
          );
      return { status: 200, body: this.motivation.preferences(profile, body, now) };
    });
  }
  entry(profile, id, body) {
    requestKey(body?.requestId);
    return this.execute(profile, body.requestId, canonical(['v2/entry', id, body]), (now) => {
      objectFields(body, ['requestId', 'action']);
      return { status: 200, body: this.motivation.join(profile, id, body.action, now) };
    });
  }
  ack(profile, id, body) {
    requestKey(body?.requestId);
    this.owns(profile, id);
    return this.execute(profile, body.requestId, canonical(['v2/ack', id, body]), (now) => {
      objectFields(body, ['requestId']);
      const { s } = this.load(profile, id);
      assertV2(s.result, 'RESULT_NOT_READY', 'Смена ещё не завершена.', 409);
      return {
        status: 200,
        body:
          s.engineVersion === 'shift-4'
            ? { competencyGain: s.result.competencyGain, alreadyRecorded: true }
            : this.motivation.ack(profile, s.result, now),
      };
    });
  }
  leaders(profile, scope, periodId, offset, limit) {
    return this.store.transaction(() =>
      this.motivation.leaders(profile, scope, periodId, offset, limit, this.clock())
    );
  }
}
