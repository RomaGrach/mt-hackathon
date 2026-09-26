import { readPending, savePending, clearPending, isUncertain } from './recovery.js';
import { api, requestId, ApiError } from './api.js';
import { render } from './views.js';
import { ShiftClient, SHIFT_PENDING_KEY } from './shift-client.js';
const shiftClient = new ShiftClient();

const app = document.querySelector('#app');
const model = {
  boot: null,
  run: null,
  view: 'home',
  brief: null,
  leaders: null,
  motivationLeaders: null,
  rankPeriod: null,
  rankOffset: 0,
  auditMessage: null,
  scope: 'crew',
  error: null,
  busy: false,
  sessionKnown: false,
  offline: !navigator.onLine,
};
let ticker = null;
let paintedKey = null;
let sampledAt = performance.now();
let sampledServer = Date.now();
let pending = readPending();

function acceptRun(run) {
  model.run = run;
  shiftClient.run = run?.schemaVersion === 2 ? run : null;
  sampledAt = performance.now();
  sampledServer = run.serverNow;
}
function paint(focus = false) {
  clearInterval(ticker);
  const active = document.activeElement;
  const focusedId = active?.id;
  const focusedValue = active?.value;
  const key =
    model.view +
    ':' +
    (model.view === 'run'
      ? model.run?.id + ':' + model.run?.phase + ':' + (model.run?.scene?.id || model.run?.nodeId)
      : model.brief || '');
  const disclosures =
    key === paintedKey
      ? [...app.querySelectorAll('details[data-disclosure]')].map((el) => [
          el.dataset.disclosure,
          el.open,
        ])
      : [];
  const fields =
    key === paintedKey && !focus
      ? [...app.querySelectorAll('input[id],select[id]')].map((el) => ({
          id: el.id,
          value: el.value,
          checked: el.checked,
        }))
      : [];
  app.innerHTML = render(model);
  for (const field of fields) {
    const el = document.getElementById(field.id);
    if (el) {
      el.value = field.value;
      if (el.type === 'checkbox') el.checked = field.checked;
    }
  }
  const mode = app.querySelector('#shift-mode'),
    variant = app.querySelector('#shift-variant');
  if (mode && variant) variant.disabled = mode.value !== 'training';
  for (const [id, open] of disclosures) {
    const el = app.querySelector('[data-disclosure="' + CSS.escape(id) + '"]');
    if (el) el.open = open;
  }
  paintedKey = key;
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
  if (
    model.view === 'run' &&
    model.run?.schemaVersion === 2 &&
    model.run.criticalWindow?.status === 'open' &&
    model.run.criticalWindow.deadline !== null
  ) {
    const tick = () => {
      const r = model.run,
        ms = Math.max(
          0,
          r.criticalWindow.deadline - (sampledServer + performance.now() - sampledAt)
        );
      const number = app.querySelector('#shift-seconds'),
        message = app.querySelector('#shift-time-message');
      if (number) number.textContent = String(Math.ceil(ms / 1000));
      const text =
        ms === 0
          ? 'Срок истёк. Проверяем состояние на сервере.'
          : ms <= 5000
            ? 'Осталось не более пяти секунд.'
            : '';
      if (message && message.textContent !== text) message.textContent = text;
      if (ms === 0 && !model.busy && !model.error)
        perform(async () => {
          acceptRun(await shiftClient.load(r.id));
        }, false);
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
      shiftClient.run = null;
      clearPending(globalThis.sessionStorage, SHIFT_PENDING_KEY);
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
      shiftClient.run = null;
      clearPending(globalThis.sessionStorage, SHIFT_PENDING_KEY);
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
  if (pending || readPending(globalThis.sessionStorage, SHIFT_PENDING_KEY))
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
  if (readPending(globalThis.sessionStorage, SHIFT_PENDING_KEY)) {
    acceptRun(await shiftClient.recover());
    model.view = 'run';
  }
  if (pending) {
    const command = pending;
    try {
      const result = await api(command.path, { method: 'POST', body: command.body });
      pending = null;
      clearPending();
      const run = result.run || result;
      if (run?.id && run.phase) {
        acceptRun(run);
        model.view = 'run';
      } else {
        const id = command.path.match(/^\/v2\/results\/([^/]+)/)?.[1];
        if (id) await openRun(id);
      }
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
  if (model.view === 'leaderboard') await loadRankings();
}

async function openRun(id) {
  acceptRun(await api('/runs/' + id));
  model.view = 'run';
  if (model.run.phase === 'result') await reloadBoot();
}
async function navigate(view) {
  model.view = view;
  await reloadBoot();
  if (view === 'leaderboard') await loadRankings();
}
async function loadRankings() {
  const period = model.rankPeriod ? '&periodId=' + encodeURIComponent(model.rankPeriod) : '';
  [model.leaders, model.motivationLeaders] = await Promise.all([
    api('/leaderboard?scope=' + model.scope),
    api('/v2/leaderboards?scope=' + model.scope + period + '&offset=' + model.rankOffset),
  ]);
}
async function startShift(options = {}) {
  if (pending || readPending(globalThis.sessionStorage, SHIFT_PENDING_KEY))
    throw new ApiError('Сначала восстановите предыдущий запрос.', 'PENDING_COMMAND', 409);
  const scenarioId = model.boot.shiftCatalog?.[0]?.id;
  if (!scenarioId) throw new ApiError('Новые смены сейчас отключены.', 'CONTENT_UNAVAILABLE', 503);
  acceptRun(
    await shiftClient.start({
      scenarioId,
      mode: 'training',
      timingPolicyId: 'standard',
      serviceClass: 'standard',
      ...options,
    })
  );
  model.view = 'run';
  model.auditMessage = null;
  await reloadBoot();
}
async function choose(id) {
  const r = model.run;
  if (!r || r.phase !== 'decision') return;
  acceptRun(await mutate('/runs/' + r.id + '/decision', { revision: r.revision, optionId: id }));
}

app.addEventListener('click', (event) => {
  const element = event.target.closest('[data-action],[data-shift-action]');
  if (
    !element ||
    element.disabled ||
    element.getAttribute('aria-disabled') === 'true' ||
    model.busy
  )
    return;
  if (element.dataset.shiftAction !== undefined) {
    const action = model.run?.actions[Number(element.dataset.shiftAction)];
    if (!action) return;
    if (
      action.command === 'abort' &&
      !confirm('Прервать смену? Учебная история сохранится без зачёта.')
    )
      return;
    if (pending || readPending(globalThis.sessionStorage, SHIFT_PENDING_KEY)) {
      model.error = 'Сначала восстановите предыдущий запрос.';
      paint(true);
      return;
    }
    perform(async () => {
      acceptRun(await shiftClient.send(action));
      if (model.run.phase === 'result') await reloadBoot();
    });
    return;
  }
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
      if (id?.startsWith('shift:')) return navigate('home');
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
    if (action === 'period-entry') {
      await mutate('/v2/periods/' + element.dataset.period + '/entry', {
        action: element.dataset.entry,
      });
      await reloadBoot();
      if (model.view === 'leaderboard') await loadRankings();
      return;
    }
    if (action === 'competitive-start')
      return startShift({
        mode: 'assessment',
        competitionSlotId: model.boot.motivation.period.slotId,
      });
    if (action === 'review-start')
      return startShift({ variantId: element.dataset.variant, timingPolicyId: 'extended' });
    if (action === 'debrief-ack') {
      await mutate('/v2/results/' + id + '/debrief-ack', {});
      return openRun(id);
    }
    if (action === 'verify-replay') {
      const report = await api('/v2/runs/' + id + '/replay');
      model.auditMessage = report.verified
        ? 'Журнал воспроизведён точно. Новые награды не выдавались.'
        : 'Не удалось проверить журнал.';
      return;
    }
    if (action === 'rank-page') {
      model.rankOffset = Number(element.dataset.offset);
      return loadRankings();
    }
    if (action === 'scope') {
      model.scope = id;
      model.rankOffset = 0;
      await loadRankings();
      return;
    }
    if (action === 'read-all') {
      await api('/notices/read', {
        method: 'POST',
        body: { ids: model.boot.notices.filter((n) => !n.readAt).map((n) => n.id) },
      });
      await reloadBoot();
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
      shiftClient.run = null;
      clearPending(globalThis.sessionStorage, SHIFT_PENDING_KEY);
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
  const data = Object.fromEntries(new FormData(event.target));
  perform(async () => {
    if (form === 'shift-start-form')
      return startShift({
        mode: data.mode,
        timingPolicyId: data.timingPolicyId,
        serviceClass: data.serviceClass,
        ...(data.mode === 'training' ? { variantId: data.variantId } : {}),
      });
    if (form === 'motivation-preferences') {
      await mutate('/v2/motivation/preferences', {
        goalDays: Number(data.goalDays),
        paused: data.paused === 'on',
        automaticNotices: data.automaticNotices === 'on',
      });
      return reloadBoot();
    }
    if (form === 'rank-period-form') {
      model.rankPeriod = data.periodId || null;
      model.rankOffset = 0;
      return loadRankings();
    }
    if (form === 'shift-replay-form') {
      acceptRun(
        await shiftClient.mutate('/v2/runs/' + model.run.id + '/replay', {
          originEventSeq: Number(data.originEventSeq),
          requestId: requestId(),
        })
      );
      model.view = 'run';
      model.auditMessage = null;
      return reloadBoot();
    }
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
  if (pending || readPending(globalThis.sessionStorage, SHIFT_PENDING_KEY)) {
    await sync();
    if (model.view === 'run') return;
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

app.addEventListener('change', (event) => {
  if (event.target.id === 'shift-mode') {
    const variant = app.querySelector('#shift-variant');
    if (variant) variant.disabled = event.target.value !== 'training';
  }
});
