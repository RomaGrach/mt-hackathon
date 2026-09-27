// Public read-only administrator view for the explicitly open test environment.
export function siteAdminAccess() {
  return { signedIn: false, authorized: true, testMode: true };
}
export function adminUsers(store, searchParams, now = Date.now()) {
  const raw = Number(searchParams.get('offset') || 0);
  const offset = Number.isInteger(raw) && raw >= 0 ? Math.min(raw, 100000) : 0;
  const limit = 50;
  const total = store.get('SELECT COUNT(*) AS total FROM profiles').total;
  const rows = store.all(
    `SELECT p.id,p.alias,p.crew,p.created_at,a.xp,a.last_visit_at,
    (SELECT COALESCE(SUM(json_extract(r.document,'$.competencyGain')),0) FROM results r WHERE r.profile_id=p.id AND json_extract(r.document,'$.engineVersion')='shift-4') AS competency_points,
    (SELECT COUNT(*) FROM runs r WHERE r.profile_id=p.id) AS attempts,
    (SELECT COUNT(*) FROM results r WHERE r.profile_id=p.id) AS completed,
    (SELECT state FROM runs r WHERE r.profile_id=p.id ORDER BY updated_at DESC LIMIT 1) AS latest_state,
    (SELECT MAX(updated_at) FROM runs r WHERE r.profile_id=p.id) AS last_action
    FROM profiles p LEFT JOIN practice_accounts a ON a.profile_id=p.id
    ORDER BY COALESCE(a.last_visit_at,p.created_at) DESC,p.id LIMIT ? OFFSET ?`,
    limit,
    offset
  );
  return {
    authorized: true,
    total,
    offset,
    nextOffset: offset + limit < total ? offset + limit : null,
    checkedAt: now,
    items: rows.map((r) => {
      const s = r.latest_state ? JSON.parse(r.latest_state) : null;
      return {
        id: r.id,
        alias: r.alias,
        crew: r.crew,
        createdAt: r.created_at,
        xp: r.xp || 0,
        competencyPoints: Math.round(r.competency_points * 100) / 100,
        turn: s?.engineVersion === 'shift-4' ? s.step : null,
        totalTurns: s?.totalTurns ?? null,
        attempts: r.attempts,
        completed: r.completed,
        lastActivityAt: Math.max(r.last_action || 0, r.last_visit_at || 0, r.created_at),
        status: !s
          ? 'new'
          : s.status === 'active' || (!s.status && s.phase !== 'result')
            ? 'in_progress'
            : s.status === 'aborted'
              ? 'aborted'
              : 'completed',
        phase: s?.phase || null,
        loyalty: s?.scales?.loyalty ?? null,
        safety: s?.scales?.safety ?? null,
        simulationSeconds: s?.simulationSeconds ?? null,
        overduePromises: s
          ? Object.values(s.tasks || {}).filter(
              (t) => t.type === 'promise' && t.breachedByEventId && t.status !== 'completed'
            ).length
          : 0,
      };
    }),
  };
}
