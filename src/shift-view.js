import { renderShift as renderPrototype } from './prototype-shift-view.js';
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
export function shiftHud(run) {
  const meter = (key, label) =>
    `<div class="compact-meter ${key}" aria-label="${label}: ${run.scales?.[key] ?? 0} из 100"><span>${label} <b>${run.scales?.[key] ?? 0}</b></span><progress max="100" value="${run.scales?.[key] ?? 0}"></progress></div>`;
  const w = run.criticalWindow;
  return `<div class="game-clock"><small>Время смены</small><time>${clockLabel(run.simulationSeconds ?? run.step * 30)}</time></div><div class="compact-meters">${meter('loyalty', 'Лояльность')}${meter('safety', 'Безопасность')}</div>${w?.status === 'open' ? `<div class="urgent-clock" aria-label="Время срочного решения"><span id="shift-seconds">${w.deadline == null ? '∞' : Math.ceil(Math.max(0, w.deadline - run.serverNow) / 1000)}</span> с<span id="shift-time-message" class="sr-only" aria-live="polite"></span></div>` : ''}`;
}
function tasks(run) {
  const all = run.tasks || [];
  const active = all.filter((t) => !['completed', 'cancelled'].includes(t.status));
  const done = all.filter((t) => ['completed', 'cancelled'].includes(t.status));
  const row = (t) =>
    `<article class="task-row ${t.overdue ? 'overdue' : ''}"><span class="task-check">${t.status === 'completed' ? '✓' : t.overdue ? '!' : '○'}</span><div><strong>${esc(t.label)}</strong><small>${esc(statuses[t.status] || t.status)}${t.overdue ? ' · срок прошёл' : t.dueSeconds != null ? ` · до ${clockLabel(t.dueSeconds)}` : ''}</small></div></article>`;
  return `<p class="sheet-intro">${active.length} в работе · ${done.length} завершено. Задачи появляются после приёмки, осмотра и ваших действий.</p>${active.map(row).join('') || '<p>Все известные задачи выполнены.</p>'}${done.length ? `<details><summary>Завершённые · ${done.length}</summary>${done.map(row).join('')}</details>` : ''}`;
}
export const tutorialContent = `<div class="tutorial-steps"><article><b>1</b><div><h3>Прочитайте ситуацию</h3><p>Вверху — где вы находитесь и что происходит. Варианты действий находятся под текстом.</p></div></article><article><b>2</b><div><h3>Выберите действие</h3><p>Длительность указана на кнопке. Чтение, карта и список задач не тратят игровое время.</p></div></article><article><b>3</b><div><h3>Проверяйте вагон и задачи</h3><p>Карта помогает перейти к известному делу. Осмотр открывает новые обстоятельства. В задачах видны адресат, срок и состояние.</p></div></article><article><b>4</b><div><h3>Следите за срочным таймером</h3><p>Он идёт в реальном времени, даже при открытой карте. Учебная пауза доступна через «Ещё».</p></div></article><article><b>5</b><div><h3>Завершите смену</h3><p>Выполните дела, откройте разбор решений и сохраните опыт. Повторная практика доступна с главной.</p></div></article></div>`;
export function sheet(id, title, content) {
  return `<dialog class="game-sheet" id="sheet-${id}" aria-labelledby="sheet-title-${id}"><header><h2 id="sheet-title-${id}">${title}</h2><button class="sheet-close" data-close-sheet aria-label="Закрыть">×</button></header><div class="sheet-body">${content}</div></dialog>`;
}
export function renderShift(run, { prototype = false, embedded = false } = {}) {
  if (prototype) return renderPrototype(run, { prototype, embedded });
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
  const hud = embedded ? '' : `<header class="app-header game-header">${shiftHud(run)}</header>`;
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
  let body = '';
  const mainActions = () =>
    `<div class="shift-actions">${buttons(['choose', 'inspect', 'wait', 'begin', 'continue', 'resume', 'finish'])}</div>`;
  if (run.phase === 'briefing')
    body = `${heading('Начало смены', 'Вагон готов к приёмке', 'Проверьте вагон, разберитесь с обращениями и выполните задачи.')}<div class="scene-card"><p>Часы начинаются с 08:00. Рабочие действия продвигают время на указанную длительность. Чтение и переходы времени не требуют.</p><p>В срочных ситуациях появится отдельный таймер реального времени.</p></div>${mainActions()}`;
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
  const current = run.incidents?.find((i) => i.id === run.focusIncidentId);
  const location =
    run.stage === 'inspection' ? 'Тамбур · приёмка' : current?.label || 'Обзор вагона';
  const map = `<p class="sheet-intro">Вагон 3 · ${esc(location)}</p><div class="wagon-map"><div class="wagon-end">Тамбур · приёмка</div><div class="zone-card">Места 18–19</div><div class="wagon-aisle">Проход</div><div class="zone-card">Салон</div><div class="wagon-end">Условная схема зон · не план мест</div></div><h3>Известные ситуации</h3>${cases || '<p>После приёмки станут доступны обращения.</p>'}${run.stage === 'service' && run.incidents?.length < 2 ? '<p class="muted">Салон ещё не осмотрен. Новые обстоятельства появятся после осмотра.</p>' : ''}`;
  const count = (run.tasks || []).filter(
    (t) => !['completed', 'cancelled'].includes(t.status)
  ).length;
  body = `<p class="location-tag">◉ Вагон 3 · ${esc(location)}</p>` + body;
  const sheets =
    sheet('tasks', 'Задачи смены', tasks(run)) +
    sheet('map', 'Карта вагона', map) +
    sheet('help', 'Как играть', tutorialContent) +
    sheet(
      'tools',
      'Управление сменой',
      `<div class="shift-actions">${tools}</div><button data-action="nav" data-view="home">⌂ На главную</button><p>Чтение и переходы · 0 с. Срочный таймер продолжает идти, пока не включена учебная пауза.</p>`
    );
  const dock = `<nav class="game-dock" aria-label="Панели смены"><button data-open-sheet="map"><span>▦</span>Вагон</button><button data-open-sheet="tasks"><span>☑ <b>${count}</b></span>Задачи</button><button data-open-sheet="help"><span>?</span>Обучение</button><button data-open-sheet="tools"><span>•••</span>Ещё</button></nav>`;
  // Keep choices anchored while only the long narrative scrolls on small displays.
  const actionAt = body.indexOf('<div class="shift-actions">');
  if (actionAt >= 0 && run.phase !== 'result') {
    const end = body.indexOf('</div>', actionAt) + 6;
    body = `<div class="scene-content">${body.slice(0, actionAt)}${body.slice(end)}</div>${body.slice(actionAt, end)}`;
  }
  const tag = embedded ? 'section' : 'main';
  return `<${tag} ${embedded ? '' : 'id="main"'} class="shift-console" data-phase="${esc(run.phase)}">${hud}<div class="shift-stage">${body.replaceAll('в списке обещаний', 'в списке задач')}</div>${dock}${sheets}</${tag}>`;
}
