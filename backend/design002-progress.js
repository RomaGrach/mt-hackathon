export function competencyProfile(store, profileId) {
  const rows = store
    .all(
      "SELECT r.document FROM results r WHERE r.profile_id=? AND json_extract(r.document,'$.engineVersion')='shift-4' ORDER BY r.id DESC",
      profileId
    )
    .map((r) => JSON.parse(r.document));
  const points = Math.round(rows.reduce((n, r) => n + (r.competencyGain || 0), 0) * 100) / 100;
  const level = Math.floor(points / 250) + 1;
  return {
    points,
    level,
    nextLevelAt: level * 250,
    levelProgress: points % 250,
    completed: rows.filter((r) => r.passed).length,
    attempts: rows.length,
    history: rows.map((r) => ({
      runId: r.runId,
      title: r.title,
      at: r.completedAt,
      score: r.shiftScore,
      gain: r.competencyGain,
      passed: r.passed,
      mode: r.mode,
      variantId: r.variantId,
      serviceClass: r.serviceClass,
      timingPolicyId: r.timingPolicy.id,
      origin: r.origin,
      scales: r.scales,
      stats: r.stats,
    })),
    mistakes: rows
      .slice(0, 10)
      .flatMap((r) =>
        r.problems
          .filter((p) => p.points < 2)
          .map((p) => ({
            runId: r.runId,
            title: p.title,
            text: p.text,
            points: p.points,
            seat: p.seat,
          }))
      )
      .slice(0, 15),
  };
}
export function competencyLeaders(store, profileId, scope = 'company', offset = 0, limit = 50) {
  const group = ['crew', 'depot', 'company'].includes(scope) ? scope : 'company';
  const profile = store.get('SELECT * FROM profiles WHERE id=?', profileId);
  const rows = store.all(
    `SELECT p.id,p.alias AS name,COALESCE(SUM(json_extract(r.document,'$.competencyGain')),0) AS score,COUNT(r.id) AS completed FROM profiles p LEFT JOIN results r ON r.profile_id=p.id AND json_extract(r.document,'$.engineVersion')='shift-4' WHERE p.${group}=? GROUP BY p.id ORDER BY score DESC,p.created_at,p.id`,
    profile[group]
  );
  const ranked = rows.map((r) => ({
    name: r.name,
    score: Math.round(r.score * 100) / 100,
    completed: r.completed,
    me: r.id === profileId,
    rank: 1 + rows.filter((x) => x.score > r.score).length,
  }));
  return {
    schemaVersion: 2,
    engineVersion: 'shift-4',
    scope: group,
    group: profile[group],
    total: rows.length,
    offset,
    limit,
    myRank: ranked.find((r) => r.me)?.rank,
    rows: ranked.slice(offset, offset + limit),
  };
}
