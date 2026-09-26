import { esc } from './ui.js';
import { renderShift, commandFor } from './shift-view.js';
import { createPreview, publicPreview, reducePreview, expirePreview } from './preview-state.js';
const root = document.querySelector('#preview');
const KEY = 'reis400.ux-preview.v1';
let storageWarning = '';
let state = createPreview();
try {
  const raw = sessionStorage.getItem(KEY);
  if (raw) {
    const saved = JSON.parse(raw);
    if (
      saved.previewVersion === 1 &&
      Array.isArray(saved.history) &&
      saved.history.length <= 40 &&
      ['briefing', 'inspection', 'overview', 'scene', 'feedback', 'paused', 'result'].includes(
        saved.phase
      )
    )
      state = saved;
    else
      storageWarning = 'Старый формат прототипа не восстановлен. Открыта новая локальная попытка.';
  }
} catch {
  storageWarning =
    'Локальное сохранение недоступно. Прототип можно посмотреть, но восстановление не гарантируется.';
}
let busy = false;
let paintedPhase = null;
function save() {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    storageWarning =
      'Не удалось сохранить прототип в этой вкладке. Это не затрагивает серверный профиль.';
  }
}
function paint(focus = true, returnId = null) {
  state = expirePreview(state, Date.now());
  save();
  const r = publicPreview(state);
  const critical = r.criticalWindow?.status === 'open';
  const disclosures =
    paintedPhase === state.phase
      ? [...root.querySelectorAll('details[data-disclosure]')].map((el) => [
          el.dataset.disclosure,
          el.open,
        ])
      : [];
  const activeId = document.activeElement?.id;
  const settings =
    state.phase === 'briefing'
      ? `<details class="panel preview-settings" data-disclosure="config"><summary>Режим и время</summary><form id="preview-config"><label for="preview-mode">Режим</label><select name="mode" id="preview-mode"><option value="training" ${state.mode === 'training' ? 'selected' : ''}>Обучение — с паузой</option><option value="assessment" ${state.mode === 'assessment' ? 'selected' : ''}>Проверка — без паузы</option></select><label for="preview-time">Время в срочной сцене</label><select name="timing" id="preview-time"><option value="untimed" ${state.policy === 'untimed' ? 'selected' : ''}>Без таймера</option><option value="standard" ${state.policy === 'standard' ? 'selected' : ''}>20 секунд</option><option value="extended" ${state.policy === 'extended' ? 'selected' : ''}>40 секунд</option></select><p>Это настройка учебного примера, не профессиональный норматив. После начала она фиксируется.</p></form></details>`
      : '';
  const extraTools = `${state.phase !== 'result' ? '<button type="button" class="outline-button" data-reset>Начать заново</button>' : ''}<a class="text-back" href="/">К рабочим тренировкам →</a><p>Нет серверного зачёта. Сценарий и таймер работают в этой вкладке, без наград и защиты ответов. Перезагрузка восстанавливает локальное состояние, пока доступно хранилище. Демо не изменяет серверный профиль.</p>`;
  let content = renderShift(r, { prototype: true }).replace('</main>', settings + '</main>');
  const embeddedTools = content.includes('<!--preview-tools-->');
  content = content.replace('<!--preview-tools-->', extraTools);
  root.innerHTML = `<header class="preview-header"><span class="wordmark">РЕЙС <b>400</b></span><span class="preview-banner">Демо · без зачёта</span></header>${storageWarning ? '<p role="status" class="connection-warning">' + esc(storageWarning) + '</p>' : ''}${content}${!critical && !embeddedTools ? '<footer class="prototype-tools"><details data-disclosure="preview-menu"><summary>О демо</summary>' + extraTools + '</details></footer>' : ''}`;
  for (const [id, open] of disclosures) {
    const el = root.querySelector('[data-disclosure="' + CSS.escape(id) + '"]');
    if (el) el.open = open;
  }
  paintedPhase = state.phase;
  if (!focus && activeId) document.getElementById(activeId)?.focus({ preventScroll: true });
  root.setAttribute('aria-busy', 'false');
  if (focus) {
    const target = returnId
      ? root.querySelector(`[data-focus-incident="${CSS.escape(returnId)}"]`)
      : null;
    if (target) {
      for (let parent = target.parentElement; parent; parent = parent.parentElement)
        if (parent.tagName === 'DETAILS') parent.open = true;
      target.focus({ preventScroll: true });
      const rect = target.getBoundingClientRect();
      if (rect.top < 0 || rect.bottom > innerHeight) target.scrollIntoView({ block: 'nearest' });
    } else {
      root.querySelector('h1')?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }
}
root.addEventListener('change', (event) => {
  if (state.phase === 'briefing' && event.target.closest('#preview-config')) {
    state = createPreview({
      mode: root.querySelector('#preview-mode').value,
      timingPolicyId: root.querySelector('#preview-time').value,
    });
    save();
    paint(false);
  }
});
root.addEventListener('submit', (event) => event.preventDefault());
root.addEventListener('click', (event) => {
  const reset = event.target.closest('[data-reset]');
  if (reset) {
    if (
      state.phase !== 'briefing' &&
      !confirm(
        'Начать новый прототип? Локальная попытка будет заменена. Серверный профиль не изменится.'
      )
    )
      return;
    state = createPreview();
    paint();
    return;
  }
  const el = event.target.closest('[data-shift-action]');
  if (!el || busy || el.getAttribute('aria-disabled') === 'true') return;
  const a = publicPreview(state).actions[Number(el.dataset.shiftAction)];
  if (!a) return;
  if (a.command === 'abort' && !confirm('Прервать эту локальную попытку?')) return;
  busy = true;
  el.disabled = true;
  const returnId = a.command === 'overview' ? state.focus : null;
  try {
    state = reducePreview(state, commandFor(a));
    paint(true, returnId);
  } catch (error) {
    storageWarning = error.message;
    paint(false);
  } finally {
    busy = false;
  }
});
setInterval(() => {
  if (document.hidden || busy) return;
  const before = state;
  state = expirePreview(state, Date.now());
  if (state !== before) {
    paint();
    return;
  }
  const w = state.critical;
  if (w?.status !== 'open' || w.deadline == null) return;
  const seconds = Math.ceil(Math.max(0, w.deadline - Date.now()) / 1000);
  const el = root.querySelector('#shift-seconds');
  if (el) el.textContent = seconds;
  const status = root.querySelector('#shift-time-message');
  if (status && seconds <= 5 && status.textContent !== 'Осталось не более пяти секунд.')
    status.textContent = 'Осталось не более пяти секунд.';
}, 250);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    const before = state;
    state = expirePreview(state, Date.now());
    if (state !== before) paint();
  }
});
window.addEventListener('offline', () => {
  storageWarning =
    'Нет сети. Этот прототип остаётся локальным; уход со страницы не ставит его таймер на паузу.';
  paint(false);
});
paint(false);
