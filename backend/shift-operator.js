import { assertV2 } from './v2-validation.js';
import { publishShiftContent } from './shift-service.js';
/** Local trusted operator interface. Never exposed through the player HTTP API. */
export function setPublicationEnabled(store, id, version, enabled, now = Date.now()) {
  return store.transaction(() => {
    const row = store.get(
      'SELECT * FROM shift_publications WHERE scenario_id=? AND content_version=?',
      id,
      version
    );
    assertV2(row, 'NOT_FOUND', 'Опубликованная версия не найдена.', 404);
    store.run(
      'UPDATE shift_publications SET enabled=? WHERE scenario_id=? AND content_version=?',
      Number(enabled),
      id,
      version
    );
    store.run(
      'INSERT INTO operator_audit(at,action,target,detail) VALUES(?,?,?,?)',
      now,
      enabled ? 'enable' : 'disable',
      id + '@' + version,
      JSON.stringify({ previous: !!row.enabled, enabled })
    );
    return { id, version, enabled };
  });
}
export function approveTechnicalReplacement(store, profile, runId, reason, now = Date.now()) {
  assertV2(
    typeof reason === 'string' && reason.trim().length >= 12 && reason.length <= 500,
    'REASON_REQUIRED',
    'Нужно описание подтверждённого технического сбоя, 12–500 символов.'
  );
  return store.transaction(() => {
    const previous = store.get(
      'SELECT * FROM technical_replacements WHERE old_run_id=? AND profile_id=?',
      runId,
      profile
    );
    if (previous) return { runId, ordinal: previous.ordinal, alreadyApproved: true };
    const run = store.get('SELECT * FROM runs WHERE id=? AND profile_id=?', runId, profile);
    const attempt = store.get(
      'SELECT * FROM competition_attempts WHERE run_id=? AND profile_id=?',
      runId,
      profile
    );
    assertV2(run && attempt, 'NOT_FOUND', 'Начатая соревновательная попытка не найдена.', 404);
    const period = store.get('SELECT * FROM motivation_periods WHERE id=?', attempt.period_id);
    assertV2(
      period.state === 'open' && now < period.end_at,
      'PERIOD_CLOSED',
      'Компенсация возможна только в текущей неделе.',
      409
    );
    assertV2(
      run.phase === 'result',
      'RUN_ACTIVE',
      'Сначала сохраните прерывание попытки обычной командой abort.',
      409
    );
    assertV2(
      !store.get('SELECT 1 FROM debrief_acks WHERE run_id=?', runId),
      'DEBRIEF_ALREADY_ACKNOWLEDGED',
      'Автоматическая компенсация после принятого разбора не поддерживается: нужна отдельная проверка постоянного прогресса.',
      409
    );
    const state = JSON.parse(run.state);
    state.technicalIssue = true;
    Object.assign(state.result, {
      technicalIssue: true,
      rankingEligible: false,
      rankingIneligibleReason: 'technical_replacement',
      seasonPoints: 0,
    });
    store.run(
      'INSERT INTO technical_replacements VALUES(?,?,?,?,?,?,?,?)',
      runId,
      profile,
      attempt.period_id,
      attempt.slot_id,
      attempt.ordinal,
      now,
      reason.trim(),
      JSON.stringify(attempt)
    );
    store.run('DELETE FROM competition_attempts WHERE run_id=?', runId);
    store.run('UPDATE runs SET state=? WHERE id=?', JSON.stringify(state), runId);
    store.run('UPDATE results SET document=? WHERE run_id=?', JSON.stringify(state.result), runId);
    const score =
      store.get(
        'SELECT MAX(score) n FROM competition_attempts WHERE profile_id=? AND period_id=? AND technical=0',
        profile,
        attempt.period_id
      ).n || 0;
    store.run(
      'UPDATE motivation_entries SET score=? WHERE profile_id=? AND period_id=?',
      score,
      profile,
      attempt.period_id
    );
    store.run(
      'INSERT INTO operator_audit(at,action,target,detail) VALUES(?,?,?,?)',
      now,
      'technical-replacement',
      attempt.period_id,
      JSON.stringify({ ordinal: attempt.ordinal, slot: attempt.slot_id })
    );
    return { runId, ordinal: attempt.ordinal, alreadyApproved: false, remainingReplacement: true };
  });
}
export { publishShiftContent };
