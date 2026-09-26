import { readPending, savePending, clearPending, isUncertain } from './recovery.js';
import { api, requestId, ApiError } from './api.js';
import { render } from './views.js';

const app = document.querySelector('#app');
const model = {
  boot: null,
  run: null,
  view: 'home',
  brief: null,
  leaders: null,
  scope: 'crew',
  error: null,
  busy: false,
  sessionKnown: false,
  offline: !navigator.onLine,
};
let ticker = null;
let sampledAt = performance.now();
let sampledServer = Date.now();
let pending = readPending();

function acceptRun(run) {
  model.run = run;
  sampledAt = performance.now();
  sampledServer = run.serverNow;
}
function paint(focus = false) {
  clearInterval(ticker);
  const active = document.activeElement;
  const focusedId = active?.id;
  const focusedValue = active?.value;
  app.innerHTML = render(model);
  if (!focus && focusedId) {
    const restored = document.getElementById(focusedId);
    if (restored && focusedValue !== undefined) restored.value = focusedValue;
    restored?.focus({ preventScroll: true });
  }
  app.querySelectorAll('.nav-item').forEach((button) => {
    const label = button.querySelector('span:nth-child(2)');
    if (label) button.setAttribute('aria-label', label.textContent);
  });
  app.setAttribute('aria-busy', String(model.busy));
  if (model.busy)
    app.querySelectorAll('button,input,select').forEach((el) => {
      el.disabled = true;
    });
  if (focus) {
    (model.error ? app.querySelector('[data-action=refresh]') : app.querySelector('h1'))?.focus({
      preventScroll: true,
    });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  if (model.view === 'run' && model.run?.phase === 'decision' && model.run.deadline !== null) {
    const tick = () => {
      const r = model.run;
      const ms = Math.max(0, r.deadline - (sampledServer + performance.now() - sampledAt));
      const number = document.querySelector('#timer-number');
      const meter = document.querySelector('#timer-meter');
      if (number) {
        number.textContent = String(Math.ceil(ms / 1000)).padStart(2, '0');
        number.classList.toggle('urgent', ms < 6000);
      }
      if (meter) meter.style.width = Math.min(100, ms / (r.node.timer * 10)) + '%';
      const announcement = app.querySelector('#timer-announcement');
      const message =
        ms === 0
          ? 'Срок истёк. Проверяем состояние на сервере.'
          : ms <= 5000
            ? 'Осталось не более пяти секунд.'
            : '';
      if (announcement && announcement.textContent !== message) announcement.textContent = message;
      if (ms === 0 && !model.busy && !model.error)
        perform(async () => {
          acceptRun(await api('/runs/' + r.id));
        });
    };
    ticker = setInterval(tick, 150);
    tick();
  }
  const hash = model.view === 'run' && model.run ? '#run/' + model.run.id : '#' + model.view;
  history.replaceState(null, '', hash);
}
async function reloadBoot() {
  try {
    model.boot = await api('/bootstrap');
    model.sessionKnown = true;
  } catch (error) {
    if (error.status === 401) {
      model.sessionKnown = true;
      model.boot = null;
      model.run = null;
      pending = null;
      clearPending();
    }
    throw error;
  }
}
async function perform(action, focus = true) {
  if (model.busy) return;
  model.busy = true;
  model.error = null;
  paint();
  try {
    await action();
  } catch (e) {
    if (e.status === 401) {
      model.boot = null;
      model.run = null;
      model.view = 'home';
      pending = null;
      clearPending();
    }
    if (['STALE_REVISION', 'WRONG_PHASE', 'DEADLINE_EXPIRED'].includes(e.code)) {
      if (model.run) {
        try {
          acceptRun(await api('/runs/' + model.run.id));
        } catch {}
      }
    }
    model.error =
      e instanceof ApiError || e.code === 'STORAGE_UNAVAILABLE'
        ? e.message
        : 'Не удалось завершить действие. Обновите состояние.';
  } finally {
    model.busy = false;
    paint(focus);
  }
}
async function mutate(path, body) {
  if (pending)
    throw new ApiError('Сначала восстановите ответ предыдущего действия.', 'PENDING_COMMAND', 409);
  const command = { path, body: { ...body, requestId: requestId() } };
  savePending(command); // If storage fails, do not transmit an unrecoverable mutation.
  pending = command;
  try {
    const result = await api(path, { method: 'POST', body: command.body });
    pending = null;
    clearPending();
    return result;
  } catch (e) {
    if (!isUncertain(e)) {
      pending = null;
      clearPending();
    }
    throw e;
  }
}

async function sync() {
  if (pending) {
    const command = pending;
    try {
      const result = await api(command.path, { method: 'POST', body: command.body });
      pending = null;
      clearPending();
      acceptRun(result);
      model.view = 'run';
    } catch (error) {
      if (!isUncertain(error)) {
        pending = null;
        clearPending();
      }
      if (['STALE_REVISION', 'WRONG_PHASE', 'DEADLINE_EXPIRED'].includes(error.code)) {
        const id = command.path.split('/')[2];
        if (id) {
          acceptRun(await api('/runs/' + id));
          model.view = 'run';
        }
      }
      throw error;
    }
  }
  await reloadBoot();
  if (model.run && model.view === 'run') acceptRun(await api('/runs/' + model.run.id));
  if (model.view === 'leaderboard') model.leaders = await api('/leaderboard?scope=' + model.scope);
}

async function openRun(id) {
  acceptRun(await api('/runs/' + id));
  model.view = 'run';
  if (model.run.phase === 'result') await reloadBoot();
}
async function navigate(view) {
  model.view = view;
  await reloadBoot();
  if (view === 'leaderboard') model.leaders = await api('/leaderboard?scope=' + model.scope);
}
async function choose(id) {
  const r = model.run;
  if (!r || r.phase !== 'decision') return;
  acceptRun(await mutate('/runs/' + r.id + '/decision', { revision: r.revision, optionId: id }));
}

app.addEventListener('click', (event) => {
  const element = event.target.closest('[data-action]');
  if (
    !element ||
    element.disabled ||
    element.getAttribute('aria-disabled') === 'true' ||
    model.busy
  )
    return;
  const { action, id, view, practice, index } = element.dataset;
  if (pending && ['start', 'choose', 'continue', 'abort', 'replay'].includes(action)) {
    model.error = 'Ответ предыдущего действия не получен. Обновите состояние перед новым выбором.';
    paint(true);
    return;
  }
  if (action === 'dismiss') {
    model.error = null;
    paint();
    return;
  }
  if (
    ['delete', 'logout'].includes(action) &&
    !confirm(
      action === 'delete'
        ? 'Удалить этот учебный профиль, все попытки и достижения с сервера? Это необратимо.'
        : 'Выйти? В демо нет восстановления входа. Для следующего входа будет создан новый профиль.'
    )
  )
    return;
  if (
    action === 'abort' &&
    !confirm('Прервать попытку? Она сохранится как незачёт, без рейтинговых очков.')
  )
    return;
  perform(async () => {
    if (action === 'refresh') return sync();
    if (action === 'nav') return navigate(view);
    if (action === 'brief') {
      model.brief = id;
      model.view = 'brief';
      return;
    }
    if (action === 'resume' || action === 'history') return openRun(id);
    if (action === 'start') {
      acceptRun(await mutate('/runs', { scenarioId: id, practice: practice === 'true' }));
      model.view = 'run';
      await reloadBoot();
      return;
    }
    if (action === 'choose') return choose(id);
    if (action === 'continue' || action === 'abort') {
      const r = model.run;
      acceptRun(await mutate('/runs/' + r.id + '/' + action, { revision: r.revision }));
      if (model.run.phase === 'result') await reloadBoot();
      return;
    }
    if (action === 'replay') {
      acceptRun(await mutate('/runs/' + model.run.id + '/replay', { index: Number(index) }));
      model.view = 'run';
      await reloadBoot();
      return;
    }
    if (action === 'scope') {
      model.scope = id;
      model.leaders = await api('/leaderboard?scope=' + id);
      return;
    }
    if (action === 'read-all') {
      model.boot.notices = await api('/notices/read', {
        method: 'POST',
        body: { ids: model.boot.notices.filter((n) => !n.readAt).map((n) => n.id) },
      });
      return;
    }
    if (action === 'export') {
      const data = await api('/profile/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'reis400-profile.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    if (action === 'delete' || action === 'logout') {
      await api(action === 'delete' ? '/profile' : '/logout', {
        method: action === 'delete' ? 'DELETE' : 'POST',
        body: action === 'delete' ? { confirm: true } : {},
      });
      model.boot = null;
      model.run = null;
      model.view = 'home';
      pending = null;
      clearPending();
    }
  });
});
app.addEventListener('submit', (event) => {
  event.preventDefault();
  if (model.busy) return;
  const crew = event.target.elements.crew?.value;
  const form = event.target.id;
  perform(async () => {
    if (form === 'join-form') {
      model.boot = await api('/session', { method: 'POST', body: { crew } });
      model.view = 'home';
    }
    if (form === 'crew-form') {
      await api('/profile', { method: 'PATCH', body: { crew } });
      await reloadBoot();
    }
  });
});
// Synchronise another tab's decisions and server time without stealing focus or repainting unchanged scenes.
setInterval(async () => {
  if (
    model.busy ||
    model.error ||
    document.hidden ||
    model.view !== 'run' ||
    !model.run ||
    model.run.phase === 'result'
  )
    return;
  try {
    const old = model.run;
    const next = await api('/runs/' + old.id, { retry: false });
    if (model.busy || model.run?.id !== old.id || model.run.revision !== old.revision) return;
    acceptRun(next);
    if (next.revision !== old.revision) paint(true);
  } catch {
    /* Explicit actions and Refresh show actionable errors; background polling stays quiet. */
  }
}, 4000);

const initialHash = location.hash;
await perform(async () => {
  try {
    await reloadBoot();
  } catch (e) {
    if (e.status === 401) return;
    throw e;
  }
  if (pending) {
    await sync();
    return;
  }
  const id = initialHash.match(/^#run\/([a-f0-9-]{36})$/)?.[1];
  if (id) return openRun(id);
  const view = initialHash.slice(1);
  if (['profile', 'leaderboard', 'notices'].includes(view)) return navigate(view);
});

// The browser's network indicator is advisory; only the server owns game time.
for (const event of ['offline', 'online'])
  window.addEventListener(event, () => {
    model.offline = !navigator.onLine;
    paint(false);
  });
document.addEventListener('visibilitychange', () => {
  if (
    !document.hidden &&
    !model.busy &&
    !model.error &&
    model.view === 'run' &&
    model.run &&
    model.run.phase !== 'result'
  )
    perform(async () => {
      acceptRun(await api('/runs/' + model.run.id));
    }, false);
});
