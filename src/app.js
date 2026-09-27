import { courseLessons } from './course.js';
import { readPending, savePending, clearPending, isUncertain } from './recovery.js';
import { api, requestId, ApiError } from './api.js';
import { render } from './views.js';
import { ShiftClient, SHIFT_PENDING_KEY } from './shift-client.js';
const shiftClient = new ShiftClient();

const app = document.querySelector('#app');
const TUTORIAL_KEY = 'reis400.interface-tour.v1';
let tutorialSeen = false;
try {
  tutorialSeen = localStorage.getItem(TUTORIAL_KEY) === 'done';
} catch {}
let tutorialStep = null;
let gameTab = 'scene';
const model = {
  tutorialSeen,
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
  admin: null,
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
  if (model.run?.id !== run.id || model.run?.revision !== run.revision) gameTab = 'scene';
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
  app.classList.toggle('game-active', model.view === 'run' && model.run?.schemaVersion === 2);
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
  if (model.view === 'run' && model.run?.schemaVersion === 2) {
    showGameTab(gameTab);
    showTutorial();
  }
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
    app
      .querySelectorAll(
        'button:not([data-game-tab]):not([data-tutorial-next]):not([data-tutorial-skip]),input,select'
      )
      .forEach((el) => {
        el.disabled = true;
      });
  if (focus) {
    (model.error ? app.querySelector('[data-action=refresh]') : app.querySelector('h1'))?.focus({
      preventScroll: true,
    });
    if (model.view !== 'run') window.scrollTo({ top: 0, behavior: 'instant' });
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
      if (ms === 0 && !model.busy && !model.error && navigator.onLine)
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
      if (ms === 0 && !model.busy && !model.error && navigator.onLine)
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
  app.setAttribute('aria-busy', 'true');
  app
    .querySelectorAll(
      'button:not([data-game-tab]):not([data-tutorial-next]):not([data-tutorial-skip]),input,select'
    )
    .forEach((el) => {
      el.disabled = true;
    });
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
async function loadAdmin(offset = 0) {
  model.admin = await api('/admin/users?offset=' + offset);
}
async function navigate(view) {
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  model.view = view;
  if (view === 'admin') return loadAdmin();
  if (!model.boot) await reloadBoot();
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
}

async function choose(id) {
  const r = model.run;
  if (!r || r.phase !== 'decision') return;
  acceptRun(await mutate('/runs/' + r.id + '/decision', { revision: r.revision, optionId: id }));
}

function showGameTab(id) {
  gameTab = id;
  app.querySelectorAll('[data-game-pane]').forEach((el) => {
    el.hidden = el.dataset.gamePane !== id;
  });
  app.querySelectorAll('[data-game-tab]').forEach((el) => {
    if (el.dataset.gameTab === id) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
}
const tourSteps = [
  [
    'scene',
    '.game-clock',
    'Время смены',
    'На часах — игровое время. Рабочее действие расходует столько времени, сколько указано на его кнопке.',
  ],
  [
    'scene',
    '.compact-meters',
    'Показатели',
    'Зелёная полоса — лояльность, синяя — безопасность. Ваши решения изменяют их.',
  ],
  [
    'scene',
    '.scene-content',
    'Ситуация',
    'Здесь указаны место и происходящее. Длинный текст можно прокрутить отдельно от кнопок.',
  ],
  [
    'scene',
    '.shift-stage > .shift-actions',
    'Действия',
    'Каждая кнопка — отдельное решение. Во время срочной ситуации появится таймер реального времени.',
  ],
  [
    'map',
    '[data-game-tab="map"]',
    'Вагон',
    'Эта кнопка открывает известные ситуации. Выберите обращение, чтобы заняться им. Осмотр салона открывает новые обстоятельства.',
  ],
  [
    'tasks',
    '[data-game-tab="tasks"]',
    'Задачи',
    'Здесь видны все задачи, их сроки и результат. Переходы между вкладками не тратят игровое время.',
  ],
  [
    'tools',
    '[data-game-tab="tools"]',
    'Управление',
    'Здесь находятся подсказка, учебная пауза, выход на главную и прерывание смены. Срочный таймер работает, пока вы не включили паузу.',
  ],
];
function finishTutorial() {
  tutorialStep = null;
  model.tutorialSeen = true;
  try {
    localStorage.setItem(TUTORIAL_KEY, 'done');
  } catch {}
  app.querySelector('.tour-guide')?.remove();
  app.querySelector('.tour-offer')?.remove();
  app.querySelectorAll('.tour-highlight').forEach((el) => el.classList.remove('tour-highlight'));
  showGameTab('scene');
}
function showTutorial() {
  app.querySelector('.tour-guide')?.remove();
  app.querySelectorAll('.tour-highlight').forEach((el) => el.classList.remove('tour-highlight'));
  const console = app.querySelector('.shift-console');
  if (!console) return;
  if (tutorialStep === null) {
    if (!model.tutorialSeen && model.run.phase === 'briefing') {
      const offer = document.createElement('div');
      offer.className = 'tour-offer';
      offer.innerHTML =
        '<span>Первый раз? Покажем управление.</span><button data-tutorial-start>Обучение</button><button data-tutorial-skip>Пропустить</button>';
      console.prepend(offer);
    }
    return;
  }
  const [pane, selector, title, text] = tourSteps[tutorialStep];
  showGameTab(pane);
  app.querySelector(selector)?.classList.add('tour-highlight');
  const guide = document.createElement('section');
  guide.className = 'tour-guide';
  guide.setAttribute('aria-label', 'Обучение');
  guide.innerHTML = `<div><small>Обучение · ${tutorialStep + 1} / ${tourSteps.length}</small><h2>${title}</h2><p>${text}</p></div><div class="tour-controls"><button data-tutorial-skip>Пропустить</button><button data-tutorial-next>${tutorialStep === tourSteps.length - 1 ? 'Начать играть' : 'Далее →'}</button></div>`;
  console.prepend(guide);
}

app.addEventListener('click', (event) => {
  const openMenu = app.querySelector('.site-menu[open]');
  if (openMenu && !event.target.closest('.site-menu')) openMenu.open = false;
  if (event.target.closest('[data-dismiss-confirm]')) {
    event.target.closest('.inline-confirmation')?.remove();
    return;
  }
  const tab = event.target.closest('[data-game-tab]');
  if (tab) {
    showGameTab(tab.dataset.gameTab);
    return;
  }
  if (event.target.closest('[data-tutorial-start]')) {
    tutorialStep = 0;
    app.querySelector('.tour-offer')?.remove();
    showTutorial();
    return;
  }
  if (event.target.closest('[data-tutorial-skip]')) {
    finishTutorial();
    if (model.view !== 'run') paint();
    return;
  }
  if (event.target.closest('[data-tutorial-next]')) {
    if (++tutorialStep >= tourSteps.length) finishTutorial();
    else showTutorial();
    return;
  }
  if (event.target.closest('[data-cancel-confirm]')) {
    event.target.closest('details').open = false;
    return;
  }
  const openSheet = event.target.closest('[data-open-sheet]');
  if (openSheet) {
    document.getElementById('sheet-' + openSheet.dataset.openSheet)?.showModal();
    return;
  }
  const closeSheet = event.target.closest('[data-close-sheet]');
  if (closeSheet) {
    closeSheet.closest('dialog')?.close();
    return;
  }

  const homeTab = event.target.closest('[data-home-tab]');
  if (homeTab) {
    document.querySelectorAll('[data-home-pane]').forEach((p) => {
      p.hidden = p.dataset.homePane !== homeTab.dataset.homeTab;
    });
    document
      .querySelectorAll('[data-home-tab]')
      .forEach((b) => b.setAttribute('aria-pressed', String(b === homeTab)));
    return;
  }
  const incidentTarget = event.target.closest('[data-incident-target]');
  if (incidentTarget && !model.busy) {
    perform(async () => {
      const overview = model.run.actions.find(
        (a) => a.command === 'overview' && a.available !== false
      );
      if (!overview) return;
      acceptRun(await shiftClient.send(overview));
      const focus = model.run.actions.find(
        (a) =>
          a.command === 'focus' &&
          a.incidentId === incidentTarget.dataset.incidentTarget &&
          a.available !== false
      );
      if (focus) acceptRun(await shiftClient.send(focus));
    });
    return;
  }
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
    if (pending || readPending(globalThis.sessionStorage, SHIFT_PENDING_KEY)) {
      model.error = 'Сначала восстановите предыдущий запрос.';
      paint(true);
      return;
    }
    element.classList.add('action-pending');
    element.setAttribute('aria-busy', 'true');
    perform(async () => {
      acceptRun(await shiftClient.send(action));
      // Observation and waiting return directly to the updated work surface.
      // Preserve server logs and never auto-advance an assessed choice or timeout.
      if (
        ['inspect', 'wait'].includes(action.command) &&
        model.run.phase === 'feedback' &&
        !model.run.feedback?.timedOut
      ) {
        const next = model.run.actions.find(
          (a) => a.command === 'continue' && a.available !== false
        );
        if (next) acceptRun(await shiftClient.send(next));
      }
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
  if (['delete', 'logout', 'abort'].includes(action) && !element.dataset.confirmed) {
    if (element.nextElementSibling?.classList.contains('inline-confirmation')) return;
    const box = document.createElement('div');
    box.className = 'inline-confirmation';
    const message = document.createElement('p');
    message.textContent =
      action === 'delete'
        ? 'Удалить профиль и все его результаты? Это необратимо.'
        : action === 'logout'
          ? 'Выйти из профиля? В тестовой версии восстановить вход нельзя.'
          : 'Прервать попытку? Она сохранится без зачёта.';
    const yes = element.cloneNode(true);
    yes.dataset.confirmed = 'true';
    yes.textContent = 'Подтвердить';
    const no = document.createElement('button');
    no.className = 'text-back';
    no.textContent = 'Отмена';
    no.dataset.dismissConfirm = '';
    box.append(message, yes, no);
    element.after(box);
    return;
  }
  perform(async () => {
    if (action === 'course-start') {
      const lesson = courseLessons(model.boot.shiftCatalog?.[0]).find(
        (l) => l.id === element.dataset.lesson
      );
      if (!lesson) throw new Error('Смена недоступна. Обновите курс.');
      return startShift({
        mode: lesson.mode,
        timingPolicyId: lesson.timingPolicyId,
        serviceClass: lesson.serviceClass,
        variantId: lesson.variantId,
      });
    }
    if (action === 'tutorial-start') {
      const active = model.run?.phase !== 'result' ? model.run : null;
      const id = active?.id || model.boot.activeRun?.id;
      if (id) await openRun(id);
      else await startShift();
      if (model.run.schemaVersion === 2) tutorialStep = 0;
      return;
    }
    if (action === 'refresh')
      return model.view === 'admin' ? loadAdmin(model.admin?.offset || 0) : sync();
    if (action === 'admin-page') return loadAdmin(Number(element.dataset.offset));
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
const initialHash = location.hash;
await perform(async () => {
  if (initialHash === '#admin') {
    model.view = 'admin';
    return loadAdmin();
  }
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
  if (['landing', 'profile', 'leaderboard', 'notices', 'admin'].includes(view))
    return navigate(view);
});

// State refresh is event-driven; the local countdown never polls the API.
let lastRefresh = 0;
function refreshOnReturn() {
  if (document.hidden || model.busy || !navigator.onLine || Date.now() - lastRefresh < 1000) return;
  lastRefresh = Date.now();
  if (model.run && model.view === 'run' && model.run.phase !== 'result')
    perform(async () => {
      if (pending || readPending(globalThis.sessionStorage, SHIFT_PENDING_KEY)) return sync();
      acceptRun(await api('/runs/' + model.run.id));
    }, false);
}
window.addEventListener('offline', () => {
  model.offline = true;
  paint(false);
});
window.addEventListener('online', () => {
  model.offline = false;
  perform(() => (model.view === 'admin' ? loadAdmin(model.admin?.offset || 0) : sync()), false);
});
window.addEventListener('focus', refreshOnReturn);
document.addEventListener('visibilitychange', refreshOnReturn);

app.addEventListener('change', (event) => {
  if (event.target.id === 'shift-mode') {
    const variant = app.querySelector('#shift-variant');
    if (variant) variant.disabled = event.target.value !== 'training';
  }
});
