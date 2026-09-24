const achievementRules = [
  ['first-step', (p) => p.completed.length >= 1],
  ['safe-hands', (p) => p.runs.some((r) => r.passed !== false && r.safety >= 85)],
  ['people-first', (p) => p.runs.some((r) => r.passed !== false && r.loyalty >= 85)],
  ['all-routes', (p) => p.completed.length >= 3],
  ['top-score', (p) => p.runs.some((r) => r.passed !== false && r.points >= 250)]
];

export const achievements = [
  { id: 'first-step', icon: '✦', title: 'Первый рейс', description: 'Завершить первый сценарий' },
  { id: 'safe-hands', icon: '◈', title: 'Надёжные руки', description: 'Достичь безопасности 85+' },
  { id: 'people-first', icon: '♡', title: 'Забота о людях', description: 'Достичь лояльности 85+' },
  { id: 'all-routes', icon: '⌁', title: 'Все маршруты', description: 'Пройти все три сценария' },
  { id: 'top-score', icon: '★', title: 'Высший пилотаж', description: 'Набрать 250+ очков за сценарий' }
];

export function createProfile(name = 'Проводник') {
  return { name: String(name).trim().slice(0, 32) || 'Проводник', totalPoints: 0,
    completed: [], competencies: { empathy: 0, protocol: 0, speed: 0 }, achievements: [], runs: [] };
}

export function recordResult(profile, result) {
  const runs = [...profile.runs, { ...result, completedAt: typeof result.completedAt === 'string' && !Number.isNaN(Date.parse(result.completedAt)) ? result.completedAt : new Date().toISOString() }];
  const bestByScenario = new Map();
  for (const run of runs) {
    if (run.passed === false) continue;
    const previous = bestByScenario.get(run.scenarioId);
    if (!previous || run.points > previous.points) bestByScenario.set(run.scenarioId, run);
  }
  const bestRuns = [...bestByScenario.values()];
  const updated = {
    ...profile, runs,
    completed: [...bestByScenario.keys()],
    totalPoints: bestRuns.reduce((sum, run) => sum + run.points, 0),
    competencies: bestRuns.reduce((totals, run) => {
      for (const key of Object.keys(totals)) totals[key] += run.competencies?.[key] ?? 0;
      return totals;
    }, { empathy: 0, protocol: 0, speed: 0 })
  };
  updated.achievements = achievementRules.filter(([, rule]) => rule(updated)).map(([id]) => id);
  return updated;
}

export function makeLeaderboard(profiles) {
  return profiles.map((profile) => ({ name: profile.name, score: profile.totalPoints,
    completed: profile.completed.length })).sort((a, b) => b.score - a.score || b.completed - a.completed);
}

export function parseProfile(raw, fallbackName = 'Проводник') {
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || !Array.isArray(value.runs) || !Array.isArray(value.completed)) return createProfile(fallbackName);
    const profile = createProfile(typeof value.name === 'string' && value.name.trim() ? value.name : fallbackName);
    return value.runs.reduce((current, run) => {
      if (!run || typeof run.scenarioId !== 'string' || !Number.isFinite(run.points)) return current;
      return recordResult(current, run);
    }, profile);
  } catch {
    return createProfile(fallbackName);
  }
}
