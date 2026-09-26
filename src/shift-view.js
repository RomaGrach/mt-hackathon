import { esc, heading } from './ui.js';

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

export const durationLabel = (seconds) => {
  const n = Math.max(0, Math.round(Number(seconds) || 0));
  return n >= 60 ? `${Math.floor(n / 60)} мин${n % 60 ? ` ${n % 60} с` : ''}` : `${n} с`;
};
const clockLabel = (seconds) => {
  const n = 8 * 3600 + Math.max(0, Number(seconds) || 0);
  return `${String(Math.floor(n / 3600)).padStart(2, '0')}:${String(Math.floor(n / 60) % 60).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
};
function actionButton(a, i) {
  const icons = {
    choose: '✓',
    inspect: '⌕',
    wait: '◷',
    begin: '▶',
    continue: '→',
    overview: '▦',
    focus: '◉',
    pause: 'Ⅱ',
    resume: '▶',
    hint: '?',
    finish: '⚑',
    abort: '×',
  };
  return `<button type="button" class="${['choose', 'begin', 'continue', 'resume', 'finish'].includes(a.command) ? 'option' : 'outline-button'}" data-shift-action="${i}" ${a.command === 'focus' ? `data-focus-incident="${esc(a.incidentId)}"` : ''} ${a.available === false ? 'disabled aria-disabled="true"' : ''}><span class="action-icon" aria-hidden="true">${icons[a.command] || '→'}</span><span class="option-copy"><strong>${esc(a.label)}</strong>${a.unavailableReason ? `<small>${esc(a.unavailableReason)}</small>` : ''}</span>${a.durationSeconds > 0 ? `<span class="action-duration">◷ ${durationLabel(a.durationSeconds)}</span>` : ''}</button>`;
}
function tasks(run) {
  const active = (run.tasks || []).filter(
    (t) => t.type === 'promise' && !['completed', 'cancelled', 'failed'].includes(t.status)
  );
  return `<section class="promise-list" aria-label="Обещания"><h3>◷ Обещания <small>${active.length}</small></h3>${active.length ? active.map((t) => `<div class="promise ${t.overdue ? 'overdue' : ''}"><strong>${esc(t.label)}</strong><small>${t.overdue ? 'Срок пропущен · вернитесь к пассажиру' : t.dueSeconds != null ? `До ${clockLabel(t.dueSeconds)} · осталось ${durationLabel(Math.max(0, t.dueSeconds - run.simulationSeconds))}` : 'Завершите в этой смене'}</small></div>`).join('') : '<p class="muted">Нет открытых обещаний</p>'}</section>`;
}
export function renderShift(run, { prototype = false, embedded = false } = {}) {
  if (!run)
    return '<section class="reading-column"><h1 tabindex="-1">Открываем смену…</h1></section>';
  if (
    run.schemaVersion !== 2 ||
    !['briefing', 'inspection', 'overview', 'scene', 'feedback', 'paused', 'result'].includes(
      run.phase
    )
  )
    return `<section><h1 tabindex="-1">Эту смену пока нельзя открыть</h1><p>Обновите интерфейс. Данные не заменены новой версией.</p><p>${esc(run.id)}</p></section>`;
  const actions = run.actions || [];
  const used = new Set();
  const buttons = (commands) =>
    actions
      .map((a, i) => {
        if (used.has(i) || !commands.includes(a.command)) return '';
        used.add(i);
        return actionButton(a, i);
      })
      .join('');
  const w = run.criticalWindow;
  const urgent = w?.status === 'open';
  const countdown = urgent
    ? `<div class="hud-clock urgent"><small>Срочное решение</small><strong><span id="shift-seconds">${w.deadline == null ? '∞' : Math.ceil(Math.max(0, w.deadline - run.serverNow) / 1000)}</span> с</strong><span id="shift-time-message" class="sr-only" aria-live="polite"></span></div>`
    : '';
  const hud = `<header class="shift-hud"><div class="hud-clock"><small>Время смены</small><strong>${clockLabel(run.simulationSeconds ?? run.step * 30)}</strong></div><div class="hud-metric loyalty"><small>♥ Лояльность</small><strong>${run.scales?.loyalty ?? 0}<span>/100</span></strong></div><div class="hud-metric safety"><small>◈ Безопасность</small><strong>${run.scales?.safety ?? 0}<span>/100</span></strong></div>${countdown}<span class="hud-class">Вагон 3 · ${esc(run.context?.serviceClassLabel)}</span></header>`;
  const cases = (run.incidents || [])
    .map((item, index) => {
      const at = actions.findIndex((a) => a.command === 'focus' && a.incidentId === item.id);
      const current = item.id === run.focusIncidentId;
      if (at >= 0) used.add(at);
      const inside = `<span class="case-number">${index + 1}</span><span><strong>${esc(item.label)}</strong><small>${current ? 'Вы здесь · ' : ''}${esc(statuses[item.status] || item.status)}${item.handoffStatus ? ' · ' + esc(statuses[item.handoffStatus] || item.handoffStatus) : ''}</small></span>`;
      return at >= 0
        ? `<button class="case-tab ${current ? 'selected' : ''}" data-shift-action="${at}" data-focus-incident="${esc(item.id)}" ${current ? 'aria-current="true"' : ''}>${inside}</button>`
        : `<div class="case-tab ${current ? 'selected' : ''}">${inside}</div>`;
    })
    .join('');
  const rail = `<aside class="shift-rail"><h2>Ситуации в вагоне</h2>${cases || '<div class="case-tab selected"><span class="case-number">✓</span><span><strong>Приёмка вагона</strong><small>Подготовка к смене</small></span></div>'}${run.stage === 'service' && run.incidents?.length < 2 ? '<div class="case-tab unknown"><span class="case-number">⌕</span><span><strong>Салон не осмотрен</strong><small>Осмотр откроет новые обстоятельства</small></span></div>' : ''}${tasks(run)}</aside>`;
  let body = '';
  const mainActions = () =>
    `<div class="shift-actions">${buttons(['choose', 'inspect', 'wait', 'begin', 'continue', 'resume', 'finish'])}</div>`;
  if (run.phase === 'briefing')
    body = `${heading('Начало смены', 'Вагон готов к приёмке', 'Проверьте вагон, разберитесь с обращениями и выполните обещания.')}<div class="scene-card"><p>Часы начинаются с 08:00. Рабочие действия продвигают время на указанную длительность. Чтение и переходы времени не требуют.</p><p>В срочных ситуациях появится отдельный таймер реального времени.</p></div>${mainActions()}`;
  if (['inspection', 'scene'].includes(run.phase))
    body = `${heading(run.stage === 'inspection' ? 'Приёмка' : 'Ситуация · ' + (run.incidents?.find((i) => i.id === run.focusIncidentId)?.label || 'Вагон 3'), run.scene?.title || 'Текущее дело')}<div class="scene-card"><p class="speaker">${esc(run.scene?.speaker || 'Наблюдение')}</p><p class="observation">${esc(run.scene?.text)}</p></div><h2 class="decision-label">${esc(run.scene?.prompt || 'Ваше действие')}</h2>${mainActions()}`;
  if (run.phase === 'overview')
    body = `${heading('Обзор вагона', 'Выберите следующее дело')}<div class="scene-card">${(run.observations || []).map((o) => `<p>${esc(o.text)}</p>`).join('')}</div>${mainActions()}`;
  if (run.phase === 'feedback')
    body = `${heading('Результат действия', run.feedback?.timedOut ? 'Время вышло' : 'Ситуация обновилась')}<div class="scene-card feedback-card"><p class="observation">${esc(run.feedback?.text)}</p>${run.feedback?.impact ? `<div class="impact-row"><span>♥ ${Number(run.feedback.impact.loyalty) > 0 ? '+' : ''}${Number(run.feedback.impact.loyalty) || 0}</span><span>◈ ${Number(run.feedback.impact.safety) > 0 ? '+' : ''}${Number(run.feedback.impact.safety) || 0}</span></div>` : ''}</div>${mainActions()}${run.mode === 'training' && run.feedback?.explanation ? `<details class="panel" data-disclosure="explanation"><summary>Почему это важно</summary><p>${esc(run.feedback.explanation)}</p></details>` : ''}${w?.status === 'pending' ? '<p class="critical-notice">После продолжения начнётся срочная ситуация.</p>' : ''}`;
  if (run.phase === 'paused')
    body = `${heading('Учебная пауза', 'Можно подумать')}<p>Остаток срочного таймера сохранён.</p>${mainActions()}`;
  if (run.phase === 'result')
    body = `${heading('Итог смены', run.result?.title || 'Смена завершена')}<p>${esc(run.result?.summary)}</p>${run.result?.criticalError ? '<p class="critical-notice">Критическая ошибка. Зачёт не получен.</p>' : ''}<details class="panel debrief" data-disclosure="history"><summary>Разбор решений · ${(run.result?.history || []).length} событий</summary>${(run.result?.history || []).map((e, i) => `<article class="debrief-step"><span class="debrief-index">${i + 1}</span><div><h3>${esc(e.title)}</h3><p>${esc(e.text)}</p>${e.explanation ? `<p>${esc(e.explanation)}</p>` : ''}${e.alternative ? `<p>${esc(e.alternative)}</p>` : ''}</div></article>`).join('')}</details>${prototype ? '<button data-reset>Новая тренировка</button>' : ''}`;
  const tools = buttons(['overview', 'hint', 'pause', 'abort']);
  const rest = actions.map((a, i) => (used.has(i) ? '' : actionButton(a, i))).join('');
  body += rest ? `<div class="shift-actions">${rest}</div>` : '';
  if (run.mode === 'training' && run.hintText && ['scene', 'paused'].includes(run.phase))
    body += `<aside class="hint-card">${esc(run.hintText)}</aside>`;
  body += `<footer class="shift-tools">${tools}<span>Чтение и переходы · 0 с</span></footer>`;
  const tag = embedded ? 'section' : 'main';
  return `<${tag} ${embedded ? '' : 'id="main"'} class="shift-console" data-phase="${esc(run.phase)}">${hud}<div class="shift-grid">${rail}<div class="shift-stage">${body}</div></div></${tag}>`;
}
