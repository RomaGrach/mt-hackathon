import { SKILLS } from './engine.js';

export const CREWS = [
  { id: 'msk-1', name: 'Бригада М-01', depot: 'Москва · учебное депо' },
  { id: 'msk-2', name: 'Бригада М-02', depot: 'Москва · учебное депо' },
  { id: 'spb-1', name: 'Бригада П-01', depot: 'Петербург · учебное депо' },
  { id: 'spb-2', name: 'Бригада П-02', depot: 'Петербург · учебное депо' },
];
export const ACHIEVEMENTS = [
  { id: 'first-step', icon: '✦', title: 'Первый рейс', description: 'Первый зачтённый сценарий' },
  { id: 'safe-hands', icon: '◈', title: 'Надёжные руки', description: 'Зачёт с безопасностью 90+' },
  {
    id: 'people-first',
    icon: '♡',
    title: 'На стороне комфорта',
    description: 'Зачёт с лояльностью 90+',
  },
  {
    id: 'all-routes',
    icon: '⌁',
    title: 'Полная смена',
    description: 'Зачесть все модули каталога',
  },
  {
    id: 'fast',
    icon: 'ϟ',
    title: 'Без промедления',
    description: 'Зачёт с тремя срочными решениями без таймаута',
  },
  {
    id: 'team',
    icon: '♧',
    title: 'Единый экипаж',
    description: 'Набрать 4 единицы командной работы в зачтённой попытке',
  },
  {
    id: 'recovery',
    icon: '↗',
    title: 'Работа над ошибками',
    description: 'После незачёта успешно повторить тот же сценарий',
  },
];
const tips = {
  empathy:
    'Признайте неудобство, уточните потребность, предложите проверенное решение и вернитесь за обратной связью.',
  protocol:
    'Отделяйте факты от предположений. Проверяйте условия и вовремя передавайте вопрос ответственному сотруднику.',
  speed:
    'В срочной сцене сначала запускайте необходимую цепочку действий. Долгое ожидание влияет на исход.',
  teamwork:
    'Передавайте конкретные наблюдения и распределяйте задачи; не подменяйте работу экипажа обещаниями.',
};
export function weekWindow(now) {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return { start: +d, end: +d + 7 * 86400000, id: d.toISOString().slice(0, 10) };
}
function addNotice(store, profileId, key, kind, title, body, now, target = null) {
  store.run(
    'INSERT OR IGNORE INTO notices VALUES(?,?,?,?,?,?,NULL,?)',
    profileId + ':' + key,
    profileId,
    kind,
    title,
    body,
    now,
    target
  );
}
export function refreshMotivation(store, profileId, catalog, now) {
  for (const s of catalog)
    addNotice(
      store,
      profileId,
      'new:' + s.id + ':' + s.version,
      'scenario',
      'Сценарий: ' + s.title,
      'Доступна версия ' + s.version + '. Решения и таймер проверяются сервером.',
      now,
      s.id
    );
  const week = weekWindow(now);
  const completed = store.all(
    'SELECT DISTINCT scenario_id FROM results WHERE profile_id=? AND passed=1 AND practice=0 AND completed_at>=? AND completed_at<?',
    profileId,
    week.start,
    week.end
  ).length;
  addNotice(
    store,
    profileId,
    'challenge:' + week.id,
    'challenge',
    'Челлендж недели: две ситуации',
    'Зачтите два разных сценария до конца недели UTC и получите 100 сезонных бонусов. Постоянные компетенции не сгорают.',
    now
  );
  if (completed >= 2) {
    store.run(
      'INSERT OR IGNORE INTO bonuses VALUES(?,?,?,?,?,?)',
      profileId + ':weekly:' + week.id,
      profileId,
      100,
      'Челлендж: две ситуации',
      week.end,
      now
    );
    addNotice(
      store,
      profileId,
      'won:' + week.id,
      'achievement',
      'Челлендж выполнен',
      'Начислено 100 сезонных бонусов. Повторная награда за ту же неделю не выдаётся.',
      now
    );
  }
  for (const bonus of store.all(
    'SELECT * FROM bonuses WHERE profile_id=? AND expires_at>? AND expires_at<=?',
    profileId,
    now,
    now + 2 * 86400000
  )) {
    addNotice(
      store,
      profileId,
      'expiry:' + bonus.id,
      'expiry',
      'Сезонные бонусы скоро сгорят',
      bonus.amount +
        ' бонусов действуют до ' +
        new Date(bonus.expires_at).toISOString() +
        '. Очки компетенций останутся.',
      now
    );
  }
  return {
    id: week.id,
    title: 'Две ситуации за неделю',
    progress: Math.min(completed, 2),
    target: 2,
    reward: 100,
    endsAt: week.end,
    completed: completed >= 2,
  };
}
export function analytics(results, catalog) {
  const scored = results.filter((r) => !r.practice);
  const recent = scored.slice(-10);
  const evidence = Object.fromEntries(
    SKILLS.map((key) => [key, { earned: 0, possible: 0, decisions: 0 }])
  );
  let timeouts = 0;
  const reaction = [];
  for (const r of recent)
    for (const h of r.history) {
      if (h.timed) {
        reaction.push(h.responseMs);
        if (h.timedOut) timeouts++;
      }
      for (const key of SKILLS)
        if (h.possible[key] > 0) {
          evidence[key].earned += h.earned[key];
          evidence[key].possible += h.possible[key];
          evidence[key].decisions++;
        }
    }
  const skills = SKILLS.map((key) => ({
    key,
    ...evidence[key],
    percent: evidence[key].possible
      ? Math.round((100 * evidence[key].earned) / evidence[key].possible)
      : null,
    advice: evidence[key].decisions
      ? tips[key]
      : 'Пока недостаточно наблюдений. Пройдите сценарий, где оценивается этот навык.',
  }));
  const weak = skills
    .filter((s) => s.percent !== null && s.percent < 70)
    .sort((a, b) => a.percent - b.percent);
  const recommended = catalog
    .filter((s) => weak.some((w) => s.skillKeys.includes(w.key)))
    .map((s) => s.id);
  return {
    skills,
    attempts: scored.length,
    practiceAttempts: results.length - scored.length,
    sampleSize: recent.length,
    timeouts,
    timedDecisions: reaction.length,
    averageReactionSeconds: reaction.length
      ? +(reaction.reduce((a, b) => a + b, 0) / reaction.length / 1000).toFixed(1)
      : null,
    criticalAttempts: recent.filter((r) => r.criticalError).length,
    recommended,
    trend: recent.map((r) => ({
      scenarioId: r.scenarioId,
      points: r.points,
      safety: r.safety,
      loyalty: r.loyalty,
      passed: r.passed,
      at: r.completedAt,
    })),
    explanation:
      'Учебная оценка по последним 10 зачётным попыткам, включая незачёты. Это не аттестация и не диагноз профессиональной пригодности.',
  };
}
export function profileView(store, profileId, catalog, now) {
  const row = store.get('SELECT * FROM profiles WHERE id=?', profileId);
  const results = store
    .all('SELECT run_id,document FROM results WHERE profile_id=? ORDER BY id', profileId)
    .map((r) => ({ ...JSON.parse(r.document), runId: r.run_id }));
  const best = new Map();
  const scored = results.filter((r) => !r.practice);
  const passed = scored.filter((r) => r.passed);
  for (const r of passed)
    if (!best.has(r.scenarioId) || r.points > best.get(r.scenarioId).points)
      best.set(r.scenarioId, r);
  const bestResults = [...best.values()];
  const points = bestResults.reduce((sum, r) => sum + r.points, 0);
  const unlocked = {
    'first-step': best.size >= 1,
    'safe-hands': passed.some((r) => r.safety >= 90),
    'people-first': passed.some((r) => r.loyalty >= 90),
    'all-routes': catalog.every((s) => best.has(s.id)),
    fast: passed.some(
      (r) => r.history.filter((h) => h.timed).length >= 3 && r.history.every((h) => !h.timedOut)
    ),
    team: passed.some((r) => r.competencies.teamwork >= 4),
    recovery: scored.some(
      (r, i) =>
        r.passed &&
        scored.slice(0, i).some((prev) => !prev.passed && prev.scenarioId === r.scenarioId)
    ),
  };
  const bonuses = store.all(
    'SELECT amount,reason,expires_at AS expiresAt FROM bonuses WHERE profile_id=? AND expires_at>?',
    profileId,
    now
  );
  return {
    id: row.id,
    name: row.alias,
    crew: row.crew,
    depot: row.depot,
    company: row.company,
    totalPoints: points,
    completed: [...best.keys()],
    best: Object.fromEntries(bestResults.map((r) => [r.scenarioId, r.points])),
    level: 1 + Math.floor(points / 300),
    levelProgress: points % 300,
    nextLevelAt: (Math.floor(points / 300) + 1) * 300,
    achievements: Object.keys(unlocked).filter((id) => unlocked[id]),
    bonuses,
    seasonPoints: bonuses.reduce((sum, b) => sum + b.amount, 0),
    competencies: Object.fromEntries(
      SKILLS.map((key) => [key, bestResults.reduce((sum, r) => sum + r.competencies[key], 0)])
    ),
    analytics: analytics(results, catalog),
    history: results.slice(-20).reverse(),
    createdAt: row.created_at,
  };
}
export function leaderboard(store, profileId, scope, catalog) {
  const me = store.get('SELECT * FROM profiles WHERE id=?', profileId);
  const scopes = { crew: 'crew', depot: 'depot', company: 'company' };
  const column = Object.hasOwn(scopes, scope) ? scopes[scope] : null;
  if (!column) return null;
  const rows = store.all(
    'SELECT p.id,p.alias AS name,p.crew,p.depot,COALESCE(SUM(b.points),0) AS score,COUNT(b.scenario_id) AS completed FROM profiles p LEFT JOIN (SELECT profile_id,scenario_id,MAX(points) AS points FROM results WHERE passed=1 AND practice=0 GROUP BY profile_id,scenario_id) b ON b.profile_id=p.id WHERE p.' +
      column +
      '=? GROUP BY p.id ORDER BY score DESC,completed DESC,p.created_at,p.id',
    me[column]
  );
  return {
    scope,
    group: me[column],
    total: rows.length,
    scenarioCount: catalog.length,
    myRank: rows.findIndex((r) => r.id === profileId) + 1,
    rows: rows
      .slice(0, 50)
      .map(({ id, ...row }, index) => ({ ...row, rank: index + 1, me: id === profileId })),
  };
}
