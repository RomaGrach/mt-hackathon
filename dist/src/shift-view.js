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
/** Build only the tagged command; no scores, time, flags or revision overrides. */
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
function actionButton(a, i) {
  const kind =
    a.command === 'choose'
      ? 'option'
      : ['begin', 'continue', 'resume'].includes(a.command)
        ? 'primary-button'
        : 'outline-button';
  return `<button type="button" class="${kind}" data-shift-action="${i}" ${a.command === 'focus' ? `data-focus-incident="${esc(a.incidentId)}"` : ''} ${a.available === false ? 'aria-disabled="true"' : ''}><span class="option-copy"><strong>${esc(a.label)}</strong>${a.available === false && a.unavailableReason ? `<small>Недоступно: ${esc(a.unavailableReason)}</small>` : ''}</span></button>`;
}
function tasks(run) {
  const active = (run.tasks || []).filter((t) => !['completed', 'cancelled'].includes(t.status));
  if (!active.length) return '';
  return `<section class="known-tasks" aria-labelledby="tasks-title"><h2 id="tasks-title">Не забыть вернуться</h2><ul>${active.map((t) => `<li><strong>${esc(t.label)}</strong> — ${esc(statuses[t.status] || t.status)}${Number.isInteger(t.dueStep) ? `<br><small>Срок: рабочий шаг ${t.dueStep}; сейчас ${run.step}.</small>` : ''}</li>`).join('')}</ul></section>`;
}
function clock(run, prototype) {
  const w = run.criticalWindow;
  if (!w || w.status !== 'open' || w.deadline == null) return '';
  const seconds = Math.ceil(Math.max(0, w.deadline - run.serverNow) / 1000);
  return `<section class="timer-block" aria-label="Критическое окно"><div class="timer-label"><strong>Нужно действовать сейчас</strong><span role="timer" aria-live="off"><strong id="shift-seconds">${seconds}</strong> с</span></div><p class="help">${prototype ? 'Локальный таймер прототипа' : 'Время проверяет сервер'}. Уход со страницы не останавливает срок.</p><span class="sr-only" id="shift-time-message" aria-live="polite"></span></section>`;
}
/** Accept ONLY PublicRun. The production UI never imports authoring data or preview state. */
export function renderShift(run, { prototype = false } = {}) {
  if (!run)
    return `<main id="main" class="reading-column">${heading('ЗАГРУЗКА', 'Восстанавливаем смену…')}<p role="status">Проверяем актуальное состояние. Не нужно выбирать действие повторно.</p></main>`;
  const actions = run.actions || [];
  const allowedPhases = [
    'briefing',
    'inspection',
    'overview',
    'scene',
    'feedback',
    'paused',
    'result',
  ];
  if (run.schemaVersion !== 2 || !allowedPhases.includes(run.phase))
    return `<main id="main" class="reading-column">${heading('ВЕРСИЯ НЕДОСТУПНА', 'Эту смену пока нельзя открыть.')}<p>Данные не заменены новой версией. Обновите интерфейс или передайте идентификатор попытки команде.</p><p>${esc(run.id)}</p></main>`;
  const top = `<div class="shift-meta"><span>Вагон ${esc((run.context?.wagonId || 'wagon-3').replace('wagon-', ''))}</span><span>${run.mode === 'assessment' ? 'Проверка' : 'Обучение'}</span><span>${{ standard: 'Стандартное время', extended: 'Увеличенное время', untimed: 'Без таймера — скорость не оценивается' }[run.timingPolicy?.id] || 'Политика времени не получена'}</span><span>Шаг ${run.step}</span></div>`;
  let body = '';
  let rendered = new Set();
  if (run.phase === 'briefing')
    body = `${heading('ПЕРЕД СМЕНОЙ', 'Начните с приёмки.', 'Затем осмотрите вагон и разберитесь с обращениями. Некоторые изменения заметны только после ваших действий.')}<section class="panel"><h2>Вы управляете решениями, а не секундомером</h2><p>Чтение и переход между известными делами не расходуют рабочие шаги. Осмотр, разговор и ожидание меняют ситуацию.</p><p>Таймер появляется только в критическом окне. В обучении предусмотрена явная пауза; уход со страницы паузой не считается.</p></section>`;
  if (run.phase === 'inspection' || run.phase === 'scene')
    body = `${heading(run.phase === 'inspection' ? 'ПРИЁМКА' : 'ЛОКАЛЬНАЯ СЦЕНА', run.scene?.title || 'Что происходит рядом')}${clock(run, prototype)}<section class="scene-card"><p class="eyebrow">${esc(run.scene?.speaker || 'Наблюдение')}</p><p class="observation">${esc(run.scene?.text)}</p></section>${run.scene?.prompt ? `<h2>${esc(run.scene.prompt)}</h2>` : ''}${tasks(run)}`;
  if (run.phase === 'overview') {
    body = `${heading('ОБЗОР ВАГОНА', 'Что происходит сейчас')}<section class="panel"><h2>Наблюдение</h2>${(run.observations || []).map((o) => `<p class="observation">${esc(o.text)}</p>`).join('') || '<p>Новых наблюдений пока нет.</p>'}</section>${tasks(run)}<section aria-labelledby="incidents-title"><h2 id="incidents-title">Известные обращения</h2><div class="incident-list">${
      (run.incidents || [])
        .map((incident) => {
          const i = actions.findIndex((a) => a.command === 'focus' && a.incidentId === incident.id);
          if (i >= 0) rendered.add(i);
          return `<article class="incident-card"><h3>${esc(incident.label)}</h3><p>${esc(statuses[incident.status] || incident.status)}${incident.handoffStatus ? ' · ' + esc(statuses[incident.handoffStatus] || incident.handoffStatus) : ''}</p>${i >= 0 ? actionButton(actions[i], i) : ''}</article>`;
        })
        .join('') || '<p>Обращений ещё нет. Рабочий осмотр доступен ниже.</p>'
    }</div></section>`;
  }
  if (run.phase === 'feedback')
    body = `${heading(run.feedback?.timedOut ? 'СРОК ИСТЁК' : 'ПОСЛЕДСТВИЕ', 'Что изменилось')}<section class="panel"><p class="lead">${esc(run.feedback?.text)}</p>${run.mode === 'training' && run.feedback?.explanation ? `<p>${esc(run.feedback.explanation)}</p>` : ''}${run.feedback?.impact ? `<div class="impact-grid">${['loyalty', 'safety'].map((key) => `<div><span>${key === 'loyalty' ? 'Лояльность' : 'Безопасность'}</span><strong>${Number(run.feedback.impact[key]) > 0 ? '+' : ''}${Number(run.feedback.impact[key]) || 0}</strong></div>`).join('')}</div>` : ''}</section>${tasks(run)}<p class="help">Пока вы читаете, следующий таймер не идёт.${run.criticalWindow?.status === 'pending' ? ' После продолжения откроется новое срочное событие.' : ''}</p>`;
  if (run.phase === 'paused')
    body = `${heading('УЧЕБНАЯ ПАУЗА', 'Можно остановиться и подумать.')}<p>${prototype ? 'Пауза в локальном прототипе.' : 'Пауза подтверждена сервером.'} После продолжения сохранится остаток времени, а не полный срок.</p>${run.criticalWindow ? `<p>Осталось ${Math.ceil((run.criticalWindow.remainingMs || 0) / 1000)} с.</p>` : ''}${tasks(run)}`;
  if (run.phase === 'result')
    body = `${heading('ИТОГ СМЕНЫ', 'Разберите последовательность решений.')}<section class="panel"><h2>${esc(run.result?.title || 'Смена завершена')}</h2><p>${esc(run.result?.summary || '')}</p>${run.result?.criticalError ? '<p class="critical-notice">Критическая ошибка сохраняется независимо от остальных действий. Зачёт невозможен.</p>' : ''}<p>${prototype ? 'Это результат UX-прототипа. Он не подтверждает компетентность и не начисляет очки.' : run.result?.rankingEligible ? 'Условия участия в рейтинге проверены сервером.' : 'Этот результат не участвует в рейтинге.'}</p></section><section class="debrief"><h2>Что произошло и почему</h2>${(run.result?.history || []).map((e, i) => `<article class="debrief-step"><span class="debrief-index">${i + 1}</span><div><h3>${esc(e.title)}</h3><p>${esc(e.text)}</p>${e.alternative ? `<p class="alternative">Другой подход: ${esc(e.alternative)}</p>` : ''}</div></article>`).join('')}</section>`;
  return `<main id="main" class="reading-column" data-phase="${esc(run.phase)}">${top}${scales(run.scales?.loyalty, run.scales?.safety)}${body}<div class="shift-actions" aria-label="Доступные действия">${actions.map((a, i) => (rendered.has(i) ? '' : actionButton(a, i))).join('')}</div></main>`;
}
