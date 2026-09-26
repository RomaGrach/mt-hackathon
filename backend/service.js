import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { ShiftService } from './shift-service.js';
import {
  GameError,
  createState,
  decide,
  advance,
  abort,
  rewind,
  summarize,
  publicState,
} from './engine.js';
import { CREWS, ACHIEVEMENTS, profileView, refreshMotivation, leaderboard } from './progress.js';
import { scenarios as defaultCatalog, catalogCards } from './catalog.js';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const assert = (condition, code, message, status = 400) => {
  if (!condition) throw new GameError(code, message, status);
};

export class Service {
  constructor(store, { clock = Date.now, catalog = defaultCatalog, clockMode = 'elapsed' } = {}) {
    this.store = store;
    this.clock = clock;
    this.catalog = catalog;
    store.publish(catalog, clock());
    this.shifts = new ShiftService(store, { clock, clockMode });
    store.transaction(() => {
      for (const row of store.all('SELECT id FROM profiles'))
        for (const id of profileView(store, row.id, catalog, clock()).achievements)
          store.run('INSERT OR IGNORE INTO legacy_awards VALUES(?,?,?)', row.id, id, clock());
    });
  }
  session(token) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
    return (
      this.store.get(
        'SELECT profile_id AS id FROM sessions WHERE hash=? AND expires_at>?',
        hash(token),
        this.clock()
      )?.id || null
    );
  }
  createSession(crewId = CREWS[0].id) {
    const crew = CREWS.find((c) => c.id === crewId);
    assert(crew, 'INVALID_CREW', 'Выберите учебную бригаду из списка');
    const now = this.clock();
    const id = randomUUID();
    const token = randomBytes(32).toString('hex');
    return this.store.transaction(() => {
      assert(
        this.store.get('SELECT COUNT(*) AS n FROM profiles').n < 10000,
        'CAPACITY',
        'Демо-сервер достиг лимита профилей',
        503
      );
      this.store.run('DELETE FROM sessions WHERE expires_at<=?', now);
      this.store.run(
        'INSERT INTO profiles VALUES(?,?,?,?,?,?)',
        id,
        'Проводник-' + randomBytes(3).toString('hex').toUpperCase(),
        crew.id,
        crew.depot,
        'ВСМ · учебная компания',
        now
      );
      this.store.run('INSERT INTO sessions VALUES(?,?,?)', hash(token), id, now + 7 * 86400000);
      this.store.run(
        'INSERT INTO bonuses VALUES(?,?,?,?,?,?)',
        id + ':welcome',
        id,
        25,
        'Приветственный сезонный бонус',
        now + 86400000,
        now
      );
      refreshMotivation(this.store, id, this.catalog, now);
      return { token, profileId: id };
    });
  }
  logout(token) {
    if (token) this.store.run('DELETE FROM sessions WHERE hash=?', hash(token));
  }
  bootstrap(profileId) {
    this.sweep(profileId);
    const challenge = this.store.transaction(() =>
      refreshMotivation(this.store, profileId, this.catalog, this.clock())
    );
    const active = this.store.get(
      "SELECT id,scenario_id FROM runs WHERE profile_id=? AND phase<>'result' ORDER BY updated_at DESC LIMIT 1",
      profileId
    );
    const profile = profileView(this.store, profileId, this.catalog, this.clock());
    const motivation = this.shifts.motivationView(profileId);
    return {
      profile,
      motivation,
      shiftCatalog: this.shifts.catalog(),
      catalog: catalogCards(),
      crews: CREWS,
      achievements: ACHIEVEMENTS,
      challenge,
      activeRun: active ? { id: active.id, scenarioId: active.scenario_id } : null,
      notices: this.notices(profileId).filter(
        (n) => profile.history.length || n.id.startsWith(profileId + ':v2:')
      ),
      serverNow: this.clock(),
      mode: 'synthetic-demo',
    };
  }
  updateProfile(profileId, crewId) {
    const crew = CREWS.find((c) => c.id === crewId);
    assert(crew, 'INVALID_CREW', 'Недопустимая бригада');
    this.store.run('UPDATE profiles SET crew=?,depot=? WHERE id=?', crew.id, crew.depot, profileId);
    return profileView(this.store, profileId, this.catalog, this.clock());
  }
  load(profileId, runId) {
    const row = this.store.get('SELECT * FROM runs WHERE id=? AND profile_id=?', runId, profileId);
    assert(row, 'NOT_FOUND', 'Попытка не найдена', 404);
    return {
      row,
      state: JSON.parse(row.state),
      scenario: this.store.scenario(row.scenario_id, row.scenario_version),
    };
  }
  ensureNoActive(profileId) {
    const active = this.store.get(
      "SELECT id FROM runs WHERE profile_id=? AND phase<>'result' LIMIT 1",
      profileId
    );
    assert(!active, 'ACTIVE_RUN', 'Сначала продолжите или завершите текущую попытку', 409);
  }
  /** Every mutation and its idempotency receipt commit together. No client score is ever accepted. */
  command(profileId, requestId, signature, action) {
    assert(
      typeof requestId === 'string' && /^[a-zA-Z0-9-]{8,64}$/.test(requestId),
      'INVALID_REQUEST_ID',
      'Нужен requestId длиной 8–64 символа'
    );
    return this.store.transaction(() => {
      const old = this.store.get(
        'SELECT * FROM requests WHERE profile_id=? AND request_id=?',
        profileId,
        requestId
      );
      if (old) {
        assert(
          old.signature === signature,
          'KEY_REUSED',
          'requestId уже использован для другого действия',
          409
        );
        return JSON.parse(old.response);
      }
      const response = JSON.parse(JSON.stringify(action()));
      this.store.run(
        'INSERT INTO requests VALUES(?,?,?,?,?)',
        profileId,
        requestId,
        signature,
        JSON.stringify(response),
        this.clock()
      );
      return response;
    });
  }
  event(profileId, runId, kind, state, data = {}) {
    this.store.run(
      'INSERT INTO events(profile_id,run_id,kind,node_id,choice_id,at,data) VALUES(?,?,?,?,?,?,?)',
      profileId,
      runId,
      kind,
      data.nodeId || state.nodeId,
      data.choiceId || null,
      this.clock(),
      JSON.stringify(data)
    );
  }
  insertRun(profileId, scenario, state, origin = null) {
    const id = randomUUID();
    const now = this.clock();
    this.store.run(
      'INSERT INTO runs VALUES(?,?,?,?,?,?,?,?,?,?)',
      id,
      profileId,
      scenario.id,
      scenario.version,
      JSON.stringify(state),
      state.phase,
      state.deadline,
      state.revision,
      now,
      now
    );
    this.event(
      profileId,
      id,
      origin ? 'replayed' : 'started',
      state,
      origin ? { originRun: origin } : {}
    );
    return publicState(state, scenario, id, now);
  }
  start(profileId, scenarioId, practice, requestId) {
    assert(typeof practice === 'boolean', 'INVALID_MODE', 'practice должен быть boolean');
    const scenario = this.catalog.find((s) => s.id === scenarioId);
    assert(scenario, 'NOT_FOUND', 'Сценарий не найден', 404);
    return this.command(
      profileId,
      requestId,
      JSON.stringify(['start', scenarioId, practice]),
      () => {
        this.ensureNoActive(profileId);
        return this.insertRun(profileId, scenario, createState(scenario, this.clock(), practice));
      }
    );
  }
  save(profileId, id, state, scenario) {
    this.store.run(
      'UPDATE runs SET state=?,phase=?,deadline=?,revision=?,updated_at=? WHERE id=? AND profile_id=?',
      JSON.stringify(state),
      state.phase,
      state.deadline,
      state.revision,
      this.clock(),
      id,
      profileId
    );
    if (!state.finished) return;
    const before = profileView(this.store, profileId, this.catalog, this.clock()).achievements;
    const result = summarize(state, scenario);
    const inserted = this.store.run(
      'INSERT OR IGNORE INTO results(run_id,profile_id,scenario_id,scenario_version,points,passed,practice,completed_at,document) VALUES(?,?,?,?,?,?,?,?,?)',
      id,
      profileId,
      scenario.id,
      scenario.version,
      result.points,
      Number(result.passed),
      Number(result.practice),
      state.finishedAt,
      JSON.stringify(result)
    );
    if (!inserted.changes) return;
    this.event(profileId, id, 'completed', state, {
      passed: result.passed,
      practice: result.practice,
      points: result.points,
    });
    refreshMotivation(this.store, profileId, this.catalog, this.clock());
    const after = profileView(this.store, profileId, this.catalog, this.clock()).achievements;
    for (const achievement of after)
      this.store.run(
        'INSERT OR IGNORE INTO legacy_awards VALUES(?,?,?)',
        profileId,
        achievement,
        this.clock()
      );
    for (const badge of ACHIEVEMENTS.filter(
      (a) => after.includes(a.id) && !before.includes(a.id)
    )) {
      this.store.run(
        'INSERT OR IGNORE INTO notices VALUES(?,?,?,?,?,?,NULL,NULL)',
        profileId + ':badge:' + badge.id,
        profileId,
        'achievement',
        'Достижение: ' + badge.title,
        badge.description,
        this.clock()
      );
    }
  }
  act(profileId, runId, kind, body) {
    assert(
      Number.isInteger(body.revision) && body.revision >= 0,
      'INVALID_REVISION',
      'Нужна целая revision'
    );
    assert(
      ['decision', 'continue', 'abort'].includes(kind),
      'NOT_FOUND',
      'Действие не найдено',
      404
    );
    if (kind === 'decision')
      assert(
        body.optionId === null || (typeof body.optionId === 'string' && body.optionId.length <= 64),
        'INVALID_CHOICE',
        'Некорректный optionId'
      );
    return this.command(
      profileId,
      body.requestId,
      JSON.stringify([runId, kind, body.revision, body.optionId]),
      () => {
        const { state, scenario } = this.load(profileId, runId);
        assert(state.schemaVersion !== 2, 'USE_V2_API', 'Для этой смены используйте API v2', 409);
        assert(
          state.revision === body.revision,
          'STALE_REVISION',
          'Состояние изменилось. Обновите попытку.',
          409
        );
        const now = this.clock();
        const next =
          kind === 'decision'
            ? decide(state, scenario, body.optionId, now)
            : kind === 'continue'
              ? advance(state, scenario, now)
              : abort(state, now);
        this.save(profileId, runId, next, scenario);
        this.event(profileId, runId, kind, next, kind === 'decision' ? next.history.at(-1) : {});
        return publicState(next, scenario, runId, now);
      }
    );
  }
  getRun(profileId, runId) {
    const version = this.store.get(
      "SELECT json_extract(state, '$.schemaVersion') AS version FROM runs WHERE id=? AND profile_id=?",
      runId,
      profileId
    )?.version;
    if (version != null && version !== 1) return this.shifts.get(profileId, runId);
    return this.store.transaction(() => {
      let { state, scenario } = this.load(profileId, runId);
      if (state.phase === 'decision' && state.deadline !== null && state.deadline <= this.clock()) {
        state = decide(state, scenario, null, this.clock());
        this.save(profileId, runId, state, scenario);
        this.event(profileId, runId, 'timeout', state, state.history.at(-1));
      }
      return publicState(state, scenario, runId, this.clock());
    });
  }
  replay(profileId, runId, index, requestId) {
    return this.command(profileId, requestId, JSON.stringify(['replay', runId, index]), () => {
      this.ensureNoActive(profileId);
      const { state, scenario } = this.load(profileId, runId);
      assert(state.schemaVersion !== 2, 'USE_V2_API', 'Для этой смены используйте API v2', 409);
      return this.insertRun(
        profileId,
        scenario,
        rewind(state, scenario, index, this.clock()),
        runId
      );
    });
  }
  sweep(profileId = null) {
    const rows = profileId
      ? this.store.all(
          "SELECT id,profile_id FROM runs WHERE profile_id=? AND phase IN ('decision','scene') AND deadline<=? LIMIT 100",
          profileId,
          this.clock()
        )
      : this.store.all(
          "SELECT id,profile_id FROM runs WHERE phase IN ('decision','scene') AND deadline<=? LIMIT 100",
          this.clock()
        );
    for (const row of rows) this.getRun(row.profile_id, row.id);
  }
  cleanup() {
    const now = this.clock();
    this.store.run('DELETE FROM sessions WHERE expires_at<=?', now);
    // Receipts live as long as the profile: old v2 requests must never become new mutations.
  }
  notices(profileId) {
    return this.store.all(
      'SELECT id,kind,title,body,at,read_at AS readAt,target FROM notices WHERE profile_id=? ORDER BY at DESC,id DESC LIMIT 100',
      profileId
    );
  }
  markRead(profileId, ids) {
    assert(
      Array.isArray(ids) &&
        ids.length <= 100 &&
        ids.every((id) => typeof id === 'string' && id.length < 250),
      'INVALID_NOTICES',
      'Некорректный список уведомлений'
    );
    this.store.transaction(() => {
      for (const id of ids)
        this.store.run(
          'UPDATE notices SET read_at=? WHERE id=? AND profile_id=?',
          this.clock(),
          id,
          profileId
        );
    });
    return this.notices(profileId);
  }
  leaderboard(profileId, scope) {
    const result = leaderboard(this.store, profileId, scope, this.catalog);
    assert(result, 'INVALID_SCOPE', 'scope: crew, depot или company');
    return result;
  }
  exportProfile(profileId) {
    return {
      exportedAt: new Date(this.clock()).toISOString(),
      notForEmploymentDecisions: true,
      motivationV2: this.shifts.motivationView(profileId, false),
      profile: profileView(this.store, profileId, this.catalog, this.clock()),
      results: this.store
        .all('SELECT document FROM results WHERE profile_id=? ORDER BY id', profileId)
        .map((r) => JSON.parse(r.document)),
      events: this.store.all(
        'SELECT kind,node_id,choice_id,at,data FROM events WHERE profile_id=? ORDER BY id',
        profileId
      ),
    };
  }
  deleteProfile(profileId) {
    return this.store.transaction(() => {
      // Redact the deleted participant without recomputing anyone else's historical rank.
      for (const row of this.store.all(
        'SELECT id,archive FROM motivation_periods WHERE archive IS NOT NULL'
      )) {
        const archive = JSON.parse(row.archive),
          entries = archive.entries.filter((e) => e.profileId !== profileId);
        if (entries.length !== archive.entries.length)
          this.store.run(
            'UPDATE motivation_periods SET archive=? WHERE id=?',
            JSON.stringify({ ...archive, entries }),
            row.id
          );
      }
      this.store.run('DELETE FROM profiles WHERE id=?', profileId);
      return { deleted: true };
    });
  }
  integrationResults(cursor = 0, limit = 100) {
    const rows = this.store.all(
      'SELECT r.id,r.profile_id,p.alias,r.document FROM results r JOIN profiles p ON p.id=r.profile_id WHERE r.id>? ORDER BY r.id LIMIT ?',
      cursor,
      limit + 1
    );
    const page = rows.slice(0, limit);
    return {
      items: page.map((r) => ({
        eventId: r.id,
        employeeId: r.profile_id,
        alias: r.alias,
        ...JSON.parse(r.document),
      })),
      nextCursor: page.at(-1)?.id || cursor,
      hasMore: rows.length > limit,
    };
  }
  integrationProfiles(cursor = '', limit = 100) {
    const rows = this.store.all(
      'SELECT id FROM profiles WHERE id>? ORDER BY id LIMIT ?',
      cursor,
      limit + 1
    );
    const page = rows.slice(0, limit);
    return {
      items: page.map(({ id }) => {
        const p = profileView(this.store, id, this.catalog, this.clock());
        return {
          employeeId: p.id,
          notForEmploymentDecisions: true,
          practiceV2: this.shifts.motivationView(id, false),
          alias: p.name,
          crew: p.crew,
          depot: p.depot,
          totalPoints: p.totalPoints,
          seasonPoints: p.seasonPoints,
          level: p.level,
          competencies: p.competencies,
          achievements: p.achievements,
        };
      }),
      nextCursor: page.at(-1)?.id || cursor,
      hasMore: rows.length > limit,
    };
  }
}
