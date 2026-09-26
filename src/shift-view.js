import { esc, heading, scales } from './ui.js';

const statuses = {
  open: 'Открыто',
  waiting: 'Ожидает ответа',
  resolved: 'Завершено',
  failed: 'Не выполнено',
  requested: 'Запрос отправлен',
  accepted: 'Запрос принят',
  completed: 'Исполнено',
  breached: 'Срок пропущен',
  cancelled: 'Отменено',
  deferred: 'Отложено',
};
const simpleCommands = new Set([
  'begin',
  'continue',
  'overview',
  'pause',
  'resume',
  'finish',
  'abort',
  'wait',
]);
/** Only encode server-offered commands, never scores, clocks or correctness. */
export function commandFor(action) {
  if (!action || action.available === false) throw new Error('Действие недоступно.');
  const type = action.command;
  if (simpleCommands.has(type)) return { type };
  if (type === 'focus') return { type, incidentId: action.incidentId };
  if (type === 'inspect') return { type, zoneId: action.zoneId, actionId: action.actionId };
  if (type === 'choose')
    return {
      type,
      incidentId: action.incidentId,
      sceneId: action.sceneId,
      actionId: action.actionId,
      windowId: action.windowId ?? null,
    };
  if (type === 'hint') return { type, hintId: action.hintId };
  throw new Error('Эта версия интерфейса не поддерживает действие. Обновите страницу.');
}
function actionButton(a, i, { card = false, status = '', primary = false } = {}) {
  const kind = card
    ? 'incident-card option'
    : a.command === 'choose'
      ? 'option'
      : primary || ['begin', 'continue', 'resume'].includes(a.command)
        ? 'primary-button'
        : 'outline-button';
  return `<button type="button" class="${kind}" data-shift-action="${i}" ${a.command === 'focus' ? `data-focus-incident="${esc(a.incidentId)}"` : ''} ${card ? `aria-label="${esc(a.label)}"` : ''} ${a.available === false ? 'aria-disabled="true"' : ''}><span class="option-copy"><strong>${esc(a.label)}</strong>${status ? `<small>${esc(status)}</small>` : ''}${a.available === false && a.unavailableReason ? `<small>Недоступно: ${esc(a.unavailableReason)}</small>` : ''}</span>${card ? '<span class="card-arrow" aria-hidden="true">→</span>' : ''}</button>`;
}
function tasks(run) {
  const active = (run.tasks || []).filter((t) => !['completed', 'cancelled'].includes(t.status));
  if (!active.length) return '';
  return `<aside class="known-tasks" aria-labelledby="tasks-title"><h2 id="tasks-title">Не забыть</h2>${active
    .map((t) => {
      const left =
        Number.isInteger(t.dueStep) && Number.isInteger(run.step)
          ? Math.max(0, t.dueStep - run.step)
          : null;
      return `<p><strong>${esc(t.label)}</strong><span class="task-status">${esc(statuses[t.status] || t.status)}${left !== null && t.status !== 'breached' ? ` · До срока: ${left} рабочих действий` : ''}</span></p>`;
    })
    .join('')}</aside>`;
}
function clock(run) {
  const w = run.criticalWindow;
  if (!w || w.status !== 'open') return '';
  if (w.deadline == null)
    return '<p class="timing-note">Срочная ситуация · учебный режим без отсчёта</p>';
  const seconds = Math.ceil(Math.max(0, w.deadline - run.serverNow) / 1000);
  return `<section class="timer-block" aria-label="Критическое окно"><div class="timer-label"><strong>Время на решение</strong><span role="timer" aria-live="off"><strong id="shift-seconds">${seconds}</strong> с</span></div><span class="sr-only" id="shift-time-message" aria-live="polite"></span></section>`;
}
/** PublicRun presentation. Secondary controls may be disclosed; choices are NEVER hidden. */
export function renderShift(run, { prototype = false } = {}) {
  if (!run)
    return `<main id="main" class="reading-column">${heading('Загрузка', 'Восстанавливаем смену…')}<p role="status">Проверяем актуальное состояние.</p></main>`;
  if (
    run.schemaVersion !== 2 ||
    !['briefing', 'inspection', 'overview', 'scene', 'feedback', 'paused', 'result'].includes(
      run.phase
    )
  )
    return `<main id="main" class="reading-column">${heading('Версия недоступна', 'Эту смену пока нельзя открыть')}<p>Данные не заменены новой версией. Обновите интерфейс или передайте идентификатор попытки команде.</p><p>${esc(run.id)}</p></main>`;
  const actions = run.actions || [];
  const rendered = new Set();
  const buttons = (commands) =>
    actions
      .map((a, i) => {
        if (rendered.has(i) || !commands.includes(a.command)) return '';
        rendered.add(i);
        return actionButton(a, i);
      })
      .join('');
  const mainActions = () =>
    `<div class="shift-actions" aria-label="Доступные действия">${buttons(['choose', 'begin', 'continue', 'resume', 'pause', 'overview', 'hint'])}</div>`;
  const wagon = esc((run.context?.wagonId || 'wagon-3').replace('wagon-', ''));
  let body = '';
  if (run.phase === 'briefing') {
    body = `${heading('Тренажёр проводника', 'Ваша смена', 'Вы в вагоне 3. Начните с приёмки, затем работайте с обращениями пассажиров.')}<p class="timing-note">${run.timingPolicy?.id === 'untimed' ? 'Без таймера. Можно освоиться без спешки.' : 'В срочных сценах появится таймер. Уход со страницы его не останавливает.'}</p>${mainActions()}`;
  }
  if (run.phase === 'inspection' || run.phase === 'scene') {
    body = `${heading(run.phase === 'inspection' ? 'Приёмка вагона' : 'Вагон ' + wagon, run.scene?.title || 'Что происходит рядом')}${scales(run.scales?.loyalty, run.scales?.safety)}<section class="scene-card"><p class="speaker">${esc(run.scene?.speaker || 'Наблюдение')}</p><p class="observation">${esc(run.scene?.text)}</p></section>${clock(run)}${run.scene?.prompt ? `<h2>${esc(run.scene.prompt)}</h2>` : ''}${mainActions()}${tasks(run)}`;
  }
  if (run.phase === 'overview') {
    const incidents = run.incidents || [];
    const terminal = (x) => ['resolved', 'failed'].includes(x.status);
    const cards = (list) =>
      list
        .map((incident) => {
          const i = actions.findIndex((a) => a.command === 'focus' && a.incidentId === incident.id);
          const status =
            (statuses[incident.status] || incident.status) +
            (incident.handoffStatus
              ? ' · ' + (statuses[incident.handoffStatus] || incident.handoffStatus)
              : '');
          if (i >= 0) {
            rendered.add(i);
            return actionButton(actions[i], i, { card: true, status });
          }
          return `<article class="incident-card"><h3>${esc(incident.label)}</h3><p>${esc(status)}</p></article>`;
        })
        .join('');
    body = `${heading('Обзор вагона', 'Что происходит сейчас')}${scales(run.scales?.loyalty, run.scales?.safety)}<section class="scene-card" aria-label="Наблюдения">${(run.observations || []).map((o) => `<p class="observation">${esc(o.text)}</p>`).join('') || '<p>Новых наблюдений пока нет.</p>'}</section>${tasks(run)}<section aria-label="Известные обращения"><div class="incident-list">${cards(incidents.filter((x) => !terminal(x)))}</div></section><div class="shift-actions" aria-label="Рабочие действия">${buttons(['inspect', 'wait'])}</div>`;
    if (incidents.some(terminal))
      body += `<details class="panel" data-disclosure="completed"><summary>Завершённые обращения</summary><div class="incident-list">${cards(incidents.filter(terminal))}</div></details>`;
    // Only known state is considered; never infer or reveal a hidden incident count.
    const knownOpen =
      incidents.some((x) => !terminal(x)) ||
      (run.tasks || []).some((t) => !['completed', 'cancelled'].includes(t.status));
    const finishIndex = actions.findIndex((a) => a.command === 'finish');
    if (!knownOpen && finishIndex >= 0) {
      rendered.add(finishIndex);
      body += `<div class="shift-actions">${actionButton(actions[finishIndex], finishIndex, { primary: true })}</div>`;
    }
  }
  if (run.phase === 'feedback') {
    body = `${heading('Последствие', run.feedback?.timedOut ? 'Время вышло' : 'Что изменилось')}<section class="scene-card feedback-card"><p class="lead">${esc(run.feedback?.text)}</p>${run.mode === 'training' && run.feedback?.explanation ? `<p>${esc(run.feedback.explanation)}</p>` : ''}</section>${mainActions()}<p class="timing-note">${run.criticalWindow?.status === 'pending' ? 'После продолжения начнётся срочная ситуация.' : 'Следующий таймер ещё не идёт.'}</p>${tasks(run)}${scales(run.scales?.loyalty, run.scales?.safety)}${run.feedback?.impact ? `<details class="panel" data-disclosure="impact"><summary>Изменение показателей</summary><p>${['loyalty', 'safety'].map((k) => `${k === 'loyalty' ? 'Лояльность' : 'Безопасность'}: ${Number(run.feedback.impact[k]) > 0 ? '+' : ''}${Number(run.feedback.impact[k]) || 0}`).join(' · ')}</p></details>` : ''}`;
  }
  if (run.phase === 'paused')
    body = `${heading('Учебная пауза', 'Можно подумать')}<p>После продолжения сохранится остаток времени.</p>${run.criticalWindow?.durationMs != null ? `<p>Осталось ${Math.ceil((run.criticalWindow.remainingMs || 0) / 1000)} с.</p>` : ''}${mainActions()}${tasks(run)}`;
  if (run.phase === 'result')
    body = `${heading('Итог смены', run.result?.title || 'Смена завершена')}<p class="lead">${esc(run.result?.summary || '')}</p>${run.result?.criticalError ? '<p class="critical-notice">Критическая ошибка. Зачёт невозможен независимо от остальных действий.</p>' : ''}${scales(run.scales?.loyalty, run.scales?.safety)}<p>${prototype ? 'Результат демо не начисляет очки и не попадает в профиль.' : run.result?.rankingEligible ? 'Условия рейтинга проверены сервером.' : 'Результат не участвует в рейтинге.'}</p><details class="panel debrief" data-disclosure="history" open><summary>Что произошло и почему</summary>${(run.result?.history || []).map((e, i) => `<article class="debrief-step"><span class="debrief-index">${i + 1}</span><div><h3>${esc(e.title)}</h3><p>${esc(e.text)}</p>${e.alternative ? `<p class="alternative">Другой подход: ${esc(e.alternative)}</p>` : ''}</div></article>`).join('')}</details>${prototype ? '<button type="button" class="primary-button" data-reset>Новая тренировка</button>' : ''}`;
  // All offered actions remain reachable. Administrative actions never compete with choices.
  const admin = buttons(['finish', 'abort']);
  const rest = actions.map((a, i) => (rendered.has(i) ? '' : actionButton(a, i))).join('');
  if (rest) body += `<div class="shift-actions">${rest}</div>`;
  if (
    run.criticalWindow?.status !== 'open' &&
    (!['briefing', 'result'].includes(run.phase) || admin)
  ) {
    body += `<details class="run-details" data-disclosure="tools"><summary>Управление сменой</summary>${admin ? '<p>Незавершённые дела останутся в итоговом разборе.</p><div class="shift-actions">' + admin + '</div>' : ''}<p>Вагон ${wagon} · ${run.mode === 'assessment' ? 'Проверка' : 'Обучение'} · ${run.timingPolicy?.id === 'untimed' ? 'Без таймера' : 'С критическим таймером'} · рабочий шаг ${run.step}.</p><p>Чтение и переключение не расходуют шаги. Осмотр, разговор и ожидание меняют ситуацию. Уход со страницы не останавливает открытый таймер.</p><!--preview-tools--></details>`;
  }
  return `<main id="main" class="reading-column" data-phase="${esc(run.phase)}">${body}</main>`;
}
