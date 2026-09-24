import { scenarios, getScenario } from './scenarios.js';
import { createRun, getNode, makeDecision, rewindToDecision, summarizeRun } from './game.js';
import { achievements, createProfile, makeLeaderboard, parseProfile, recordResult } from './profile.js';

const app = document.querySelector('#app');
const storageKey = 'reis400.profiles.v1';
const activeKey = 'reis400.active.v1';
const icons = { home: '▦', profile: '◉', leaderboard: '▤' };
const skillNames = { empathy: 'Эмпатия', protocol: 'Работа по регламенту', speed: 'Скорость реакции' };
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function loadProfiles() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey));
    if (!Array.isArray(value)) return [createProfile()];
    const profiles = value.slice(0, 50).map((item) => parseProfile(JSON.stringify(item))).filter(Boolean);
    return profiles.length ? profiles : [createProfile()];
  } catch {
    return [createProfile()];
  }
}

let profiles = loadProfiles();
let activeName = localStorage.getItem(activeKey) || profiles[0].name;
if (!profiles.some((profile) => profile.name === activeName)) activeName = profiles[0].name;
let view = 'home';
let run = null;
let feedbackOpen = false;
let recorded = false;
let deadline = null;
let timerId = null;

function currentProfile() { return profiles.find((profile) => profile.name === activeName) ?? profiles[0]; }
function persist() {
  localStorage.setItem(storageKey, JSON.stringify(profiles));
  localStorage.setItem(activeKey, activeName);
}
function initials(name) { return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join(''); }
function pct(value) { return Math.max(0, Math.min(100, value)); }

function stopTimer() { if (timerId) clearInterval(timerId); timerId = null; deadline = null; }
function startTimer(node) {
  stopTimer();
  if (!node.timer || feedbackOpen || run?.finished) return;
  deadline = Date.now() + node.timer * 1000;
  timerId = setInterval(() => {
    if (!run || feedbackOpen) return;
    const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    const number = document.querySelector('[data-timer-number]');
    const meter = document.querySelector('[data-timer-meter]');
    if (number) number.textContent = String(seconds).padStart(2, '0');
    if (meter) meter.style.width = `${seconds / node.timer * 100}%`;
    if (seconds === 0) choose(null);
  }, 100);
}

function navButton(id, label) {
  return `<button class="nav-item ${view === id && !run ? 'active' : ''}" data-action="navigate" data-view="${id}" aria-label="${label}" aria-current="${view === id && !run ? 'page' : 'false'}"><span class="nav-icon">${icons[id]}</span><span>${label}</span></button>`;
}

function shell(content, eyebrow = 'ЦЕНТР ПОДГОТОВКИ') {
  const profile = currentProfile();
  app.innerHTML = `<div class="app-shell">
    <aside class="sidebar">
      <button class="brand" data-action="navigate" data-view="home" aria-label="На главную"><span class="brand-mark"><span></span><span></span></span><span class="brand-name">РЕЙС<span>400</span><small>ТРЕНАЖЁР ВСМ</small></span></button>
      <div class="nav-group-label">РАБОЧЕЕ ПРОСТРАНСТВО</div>
      <nav aria-label="Главное меню">${navButton('home', 'Тренировка')}${navButton('profile', 'Мой профиль')}${navButton('leaderboard', 'Рейтинг')}</nav>
      <div class="sidebar-bottom"><div class="rail-decor"><div class="rail-lines"></div><span>СКОРОСТЬ РЕШЕНИЯ<br><strong>ИМЕЕТ ЗНАЧЕНИЕ</strong></span></div><button class="mini-profile" data-action="navigate" data-view="profile"><span class="avatar">${escapeHtml(initials(profile.name))}</span><span class="mini-profile-text"><strong>${escapeHtml(profile.name)}</strong><small>${profile.totalPoints} очков компетенций</small></span><span class="mini-chevron">↗</span></button></div>
    </aside>
    <div class="workspace"><header class="topbar"><div class="crumb"><span class="crumb-dot"></span>${eyebrow}</div><div class="topbar-right"><span class="live-pill"><span></span> ДЕМО-ТРЕНАЖЁР</span><span class="top-date">ВСМ / 400 КМ/Ч</span></div></header><main>${content}</main></div>
  </div>`;
}

function metricCard(value, label, type, small = false) {
  return `<div class="metric ${small ? 'metric-small' : ''}"><div class="metric-top"><span>${label}</span><strong>${value}%</strong></div><div class="meter"><span class="meter-fill ${type}" style="width:${pct(value)}%"></span></div></div>`;
}

function home() {
  const profile = currentProfile();
  const completed = profile.completed.length;
  shell(`<section class="hero"><div class="hero-copy"><div class="eyebrow"><span class="eyebrow-line"></span> ИНТЕРАКТИВНАЯ ПОДГОТОВКА · ВСМ</div><h1>Решения за секунды.<br><em>Уверенность</em> на маршруте.</h1><p>Тренируйте реальные рабочие ситуации, принимайте решения под давлением времени и наблюдайте последствия каждого выбора.</p><button class="primary-button" data-action="start" data-scenario="${scenarios.find((item) => !profile.completed.includes(item.id))?.id ?? scenarios[0].id}">Начать тренировку <span>↗</span></button></div><div class="hero-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="train-shape"><span class="train-window"></span><span class="train-window"></span><span class="train-window"></span><span class="train-window"></span></div><div class="speed-tag"><small>РАБОЧАЯ СКОРОСТЬ</small><strong>400<span>км/ч</span></strong></div><div class="art-grid"></div></div></section>
    <div class="section-title-row"><div><div class="eyebrow muted">ВАШ ПРОГРЕСС</div><h2>Панель проводника</h2></div><span class="section-subtitle">Каждый выбор приближает к мастерству</span></div>
    <section class="stats-grid" aria-label="Прогресс"><div class="stat-card"><span class="stat-icon violet-icon">◈</span><strong>${profile.totalPoints.toLocaleString('ru-RU')}</strong><span>Очков компетенций</span><small>Лучшие результаты по сценариям</small></div><div class="stat-card"><span class="stat-icon coral-icon">◎</span><strong>${completed}<i> / ${scenarios.length}</i></strong><span>Сценариев пройдено</span><small>Попробуйте разные решения</small></div><div class="stat-card"><span class="stat-icon mint-icon">✦</span><strong>${profile.achievements.length}<i> / ${achievements.length}</i></strong><span>Достижений открыто</span><small>Каждый навык имеет значение</small></div></section>
    <div class="section-title-row scenario-heading"><div><div class="eyebrow muted">ТРЕНИРОВОЧНЫЕ МОДУЛИ</div><h2>Выберите ситуацию</h2></div><span class="section-subtitle">3 сценария · несколько исходов</span></div>
    <section class="scenario-grid" aria-label="Сценарии">${scenarios.map((scenario) => `<article class="scenario-card ${scenario.accent}"><div class="scenario-card-top"><span class="scenario-number">СЦЕНАРИЙ ${scenario.number}</span><span class="scenario-icon">${scenario.icon}</span></div><div class="scenario-category">${scenario.category}</div><h3>${scenario.title}</h3><p>${scenario.summary}</p><div class="scenario-tags"><span>${scenario.duration}</span><span>${scenario.difficulty}</span></div><button class="scenario-start" data-action="start" data-scenario="${scenario.id}">${profile.completed.includes(scenario.id) ? 'Пройти снова' : 'Начать сценарий'} <span>↗</span></button></article>`).join('')}</section>
    <div class="bottom-note"><span>ⓘ</span><p>Учебные ситуации демонстрационные. Перед использованием в реальной подготовке сценарии и оценки должны быть согласованы с регламентами перевозчика.</p></div>`, 'ГЛАВНАЯ / ТРЕНИРОВКА');
}

function runView() {
  const scenario = getScenario(run.scenarioId);
  const node = getNode(run);
  if (feedbackOpen) return feedbackView(scenario, node);
  if (run.finished) return resultView(scenario, node);
  const stage = run.history.length + 1;
  const timeHtml = node.timer ? `<div class="timer-block"><div class="timer-label"><span>⏱ СРОЧНОЕ РЕШЕНИЕ</span><strong data-timer-number>${String(node.timer).padStart(2, '0')}</strong></div><div class="timer-meter"><span data-timer-meter></span></div></div>` : `<div class="pace-label">Без ограничения времени · изучите ситуацию</div>`;
  shell(`<div class="game-topline"><button class="text-back" data-action="exit">← К сценариям</button><span class="game-stage">СЦЕНА ${String(stage).padStart(2, '0')} / 02</span></div>
    <div class="game-layout"><section class="game-main"><div class="scene-header"><div class="eyebrow"><span class="eyebrow-line"></span> ${scenario.category.toUpperCase()} / СЦЕНАРИЙ ${scenario.number}</div><h1>${scenario.title}</h1><p>Решение меняет ситуацию. Выберите действие, которое считаете правильным.</p></div>
    <div class="scene-card"><div class="scene-card-head"><span class="pulse-icon">${scenario.icon}</span><div><span class="scene-person">${node.speaker}</span><small>${node.label}</small></div><span class="scene-live"><i></i> СЕЙЧАС</span></div><blockquote>${escapeHtml(node.text)}</blockquote><div class="scene-footer"><span>ВИРТУАЛЬНАЯ СИТУАЦИЯ</span><span>ВСМ · ${scenario.number}</span></div></div>
    <div class="decision-heading"><div><div class="eyebrow muted">ВАШ ХОД</div><h2>${node.prompt}</h2></div><span>Выберите один вариант</span></div><div class="decision-timer">${timeHtml}</div>
    <div class="options">${node.options.map((option, index) => `<button class="option" data-action="choose" data-choice="${option.id}"><span class="option-index">${String.fromCharCode(65 + index)}</span><span class="option-copy"><strong>${option.title}</strong><small>${option.description}</small></span><span class="option-arrow">↗</span></button>`).join('')}</div></section>
    <aside class="game-side"><div class="side-card scenario-context"><div class="side-label">ТЕКУЩИЙ СЦЕНАРИЙ</div><div class="side-scenario-icon ${scenario.accent}">${scenario.icon}</div><h3>${scenario.title}</h3><p>${scenario.summary}</p><div class="context-tags">${scenario.skills.map((skill) => `<span>${skill}</span>`).join('')}</div></div><div class="side-card"><div class="side-label">ПОКАЗАТЕЛИ</div>${metricCard(run.loyalty, 'Лояльность пассажира', 'loyalty', true)}${metricCard(run.safety, 'Рейтинг безопасности', 'safety', true)}<div class="points-line"><span>Заработано</span><strong>${run.points} <small>очков</small></strong></div></div><div class="side-card time-card"><div class="side-label">ТЕМП РЕШЕНИЯ</div><p>В критических ситуациях бездействие тоже приводит к последствиям.</p></div></aside></div>`, 'ТРЕНИРОВКА / СЦЕНАРИЙ');
  startTimer(node);
}

function feedbackView(scenario, node) {
  const last = run.history.at(-1);
  const impact = last.impact;
  const delta = (value) => `${value > 0 ? '+' : ''}${value ?? 0}`;
  shell(`<div class="focus-page"><div class="focus-kicker">СЦЕНАРИЙ ${scenario.number} · ПОСЛЕДСТВИЯ РЕШЕНИЯ</div><div class="feedback-symbol">${last.timedOut ? '⌛' : '✦'}</div><div class="eyebrow muted">${last.timedOut ? 'ВРЕМЯ ВЫШЛО' : 'РЕШЕНИЕ ПРИНЯТО'}</div><h1>${last.timedOut ? 'Секунды имеют значение' : 'Ваш выбор изменил ситуацию'}</h1><p class="focus-lead">${escapeHtml(last.feedback)}</p>${last.critical ? '<div class="critical-notice">Критическая ошибка безопасности · зачёт за эту попытку невозможен</div>' : ''}<div class="chosen-box"><small>ВАШЕ ДЕЙСТВИЕ</small><strong>${escapeHtml(last.title)}</strong></div><div class="impact-grid"><div><span>Лояльность</span><strong class="${impact.loyalty >= 0 ? 'positive' : 'negative'}">${delta(impact.loyalty)}</strong></div><div><span>Безопасность</span><strong class="${impact.safety >= 0 ? 'positive' : 'negative'}">${delta(impact.safety)}</strong></div><div><span>Очки</span><strong class="positive">+${impact.points}</strong></div></div><button class="primary-button" data-action="continue">${run.finished ? 'Посмотреть результат' : 'Продолжить сценарий'} <span>↗</span></button></div>`, 'ТРЕНИРОВКА / ПОСЛЕДСТВИЯ');
}

function resultView(scenario, node) {
  const result = summarizeRun(run);
  const debrief = result.history.map((entry, index) => `<div class="debrief-step"><span class="debrief-index">${String(index + 1).padStart(2, '0')}</span><div><strong>${escapeHtml(entry.title)}</strong><p>${escapeHtml(entry.feedback)}</p>${entry.alternative ? `<div class="alternative"><small>ЛУЧШИЙ ХОД В ЭТОЙ РАЗВИЛКЕ</small><strong>${escapeHtml(entry.alternative.title)}</strong><span>${escapeHtml(entry.alternative.description)}</span></div>` : '<div class="choice-positive">Вы выбрали рекомендуемый путь.</div>'}</div></div>`).join('');
  shell(`<div class="result-page"><div class="result-ribbon">СЦЕНАРИЙ ЗАВЕРШЁН <span>✦</span> СЦЕНАРИЙ ЗАВЕРШЁН <span>✦</span> СЦЕНАРИЙ ЗАВЕРШЁН</div><div class="result-inner"><div class="result-medal">${result.grade === 'Отлично' ? '★' : result.grade === 'Хорошо' ? '✦' : '↗'}</div><div class="eyebrow muted">ТРЕНИРОВКА ЗАВЕРШЕНА · ${scenario.number}</div><h1>${node.title}</h1><p>${node.text}</p><span class="grade-pill">${result.grade}</span>${result.criticalError ? '<div class="critical-notice">Зачёт не получен: была допущена критическая ошибка безопасности.</div>' : ''}<div class="result-score"><strong>${result.points}</strong><span>ОЧКОВ КОМПЕТЕНЦИЙ</span></div><div class="result-metrics">${metricCard(result.loyalty, 'Лояльность пассажира', 'loyalty')}${metricCard(result.safety, 'Рейтинг безопасности', 'safety')}</div><div class="result-skills">${Object.entries(result.competencies).filter(([, value]) => value).map(([key, value]) => `<span>+${value} ${skillNames[key]}</span>`).join('') || '<span>Попробуйте другой подход, чтобы развить навыки</span>'}</div><div class="debrief"><div class="debrief-head"><div><small>РАЗБОР МАРШРУТА · ВЕРСИЯ ${escapeHtml(result.scenarioVersion)}</small><h2>Как ваши решения повлияли на исход</h2></div></div>${debrief}</div><div class="result-actions"><button class="primary-button" data-action="rewind">Переиграть развилку <span>↗</span></button><button class="outline-button" data-action="start" data-scenario="${scenario.id}">С начала</button><button class="outline-button" data-action="navigate" data-view="home">К сценариям</button></div></div></div>`, 'ТРЕНИРОВКА / РЕЗУЛЬТАТ');
}

function profileView() {
  const profile = currentProfile();
  shell(`<section class="page-heading"><div class="eyebrow"><span class="eyebrow-line"></span> ЛИЧНЫЙ КАБИНЕТ</div><h1>Ваш профиль</h1><p>Здесь виден ваш прогресс и навыки, полученные во время тренировок.</p></section><div class="profile-layout"><div class="profile-main"><div class="profile-identity"><div class="profile-avatar">${escapeHtml(initials(profile.name))}</div><div><div class="eyebrow muted">ПРОВОДНИК ВСМ</div><h2>${escapeHtml(profile.name)}</h2><span>${profile.completed.length} из ${scenarios.length} сценариев пройдено</span></div><div class="identity-score"><strong>${profile.totalPoints}</strong><span>ОЧКОВ</span></div></div><div class="panel"><div class="panel-header"><h3>Компетенции</h3><span>Лучшие результаты</span></div>${Object.entries(profile.competencies).map(([key, value]) => `<div class="skill-row"><span>${skillNames[key]}</span><div class="skill-bar"><span style="width:${Math.min(100, value * 25)}%"></span></div><strong>${value}</strong></div>`).join('')}</div><div class="panel"><div class="panel-header"><h3>История прохождений</h3><span>${profile.runs.length} попыток</span></div>${profile.runs.length ? [...profile.runs].reverse().slice(0, 8).map((result) => `<div class="history-row"><div><strong>${getScenario(result.scenarioId)?.title ?? 'Сценарий'}</strong><span>${new Date(result.completedAt).toLocaleDateString('ru-RU')}</span></div><div><strong>${result.points}</strong><span>очков</span></div></div>`).join('') : '<p class="empty-state">Вы ещё не завершили сценарии. Начните тренировку, чтобы увидеть результаты.</p>'}</div></div><aside class="profile-side"><div class="panel"><div class="panel-header"><h3>Достижения</h3><span>${profile.achievements.length} / ${achievements.length}</span></div>${achievements.map((item) => `<div class="achievement ${profile.achievements.includes(item.id) ? 'unlocked' : ''}"><span>${item.icon}</span><div><strong>${item.title}</strong><small>${item.description}</small></div></div>`).join('')}</div><div class="panel switcher"><div class="panel-header"><h3>Сменить участника</h3></div><p>Для локального рейтинга каждый коллега может создать профиль в этом браузере.</p><form id="profile-form"><label for="profile-name">Имя участника</label><div class="form-row"><input id="profile-name" name="name" maxlength="32" required placeholder="Введите имя" autocomplete="off" /><button type="submit">Сохранить</button></div></form><div class="profile-list">${profiles.map((item) => `<button data-action="switch" data-name="${escapeHtml(item.name)}" class="${item.name === activeName ? 'selected' : ''}">${escapeHtml(item.name)} <span>${item.totalPoints} очков</span></button>`).join('')}</div></div></aside></div>`, 'ПРОФИЛЬ / ПРОГРЕСС');
}

function leaderboardView() {
  const rows = makeLeaderboard(profiles);
  shell(`<section class="page-heading"><div class="eyebrow"><span class="eyebrow-line"></span> КОМАНДА / РЕЙТИНГ</div><h1>Таблица лидеров</h1><p>Сравнивайте лучшие результаты участников и возвращайтесь к сложным сценариям.</p></section><div class="leader-intro"><div><span class="leader-icon">★</span><h2>Мастерство видно в действиях</h2><p>В зачёт идут лучшие очки по каждому сценарию. Повторное прохождение помогает улучшить результат.</p></div><div class="leader-total"><strong>${profiles.length}</strong><span>УЧАСТНИКОВ</span></div></div><div class="leader-table"><div class="leader-table-head"><span>МЕСТО / СОТРУДНИК</span><span>СЦЕНАРИИ</span><span>ОЧКИ</span></div>${rows.map((row, index) => `<div class="leader-row ${row.name === activeName ? 'is-me' : ''}"><div><span class="rank ${index < 3 ? 'top-rank' : ''}">${String(index + 1).padStart(2, '0')}</span><span class="avatar small-avatar">${escapeHtml(initials(row.name))}</span><strong>${escapeHtml(row.name)}${row.name === activeName ? '<small>ВЫ</small>' : ''}</strong></div><span class="leader-completed">${row.completed} / ${scenarios.length}</span><strong class="leader-score">${row.score.toLocaleString('ru-RU')}</strong></div>`).join('')}</div><div class="bottom-note"><span>ⓘ</span><p>Рейтинг локальный: профили и результаты сохраняются только в этом браузере. Для общего рейтинга команды потребуется сервер и авторизация.</p></div>`, 'РЕЙТИНГ / КОМАНДА');
}

function render() {
  if (run) runView();
  else if (view === 'profile') profileView();
  else if (view === 'leaderboard') leaderboardView();
  else home();
}

function choose(choiceId) {
  if (!run || feedbackOpen || run.finished) return;
  const secondsLeft = deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : null;
  try { run = makeDecision(run, choiceId, secondsLeft); } catch { return; }
  stopTimer();
  feedbackOpen = true;
  render();
}

app.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action } = button.dataset;
  if (action === 'choose') return choose(button.dataset.choice);
  if (action === 'continue') {
    feedbackOpen = false;
    if (run?.finished && !recorded) {
      profiles = profiles.map((profile) => profile.name === activeName ? recordResult(profile, summarizeRun(run)) : profile);
      recorded = true;
      persist();
    }
    render();
  }
  if (action === 'start') {
    stopTimer();
    run = createRun(button.dataset.scenario);
    feedbackOpen = false;
    recorded = false;
    render();
  }
  if (action === 'rewind' && run?.finished) {
    stopTimer();
    run = rewindToDecision(run, run.history.length - 1);
    feedbackOpen = false;
    recorded = false;
    render();
  }
  if (action === 'exit' || action === 'navigate') {
    stopTimer();
    run = null;
    feedbackOpen = false;
    view = action === 'navigate' ? button.dataset.view : 'home';
    render();
  }
  if (action === 'switch') {
    activeName = button.dataset.name;
    persist();
    render();
  }
});

app.addEventListener('submit', (event) => {
  if (event.target.id !== 'profile-form') return;
  event.preventDefault();
  const input = event.target.elements.name;
  const name = input.value.trim().replace(/\s+/g, ' ').slice(0, 32);
  if (!name) return;
  const found = profiles.find((profile) => profile.name.toLocaleLowerCase('ru-RU') === name.toLocaleLowerCase('ru-RU'));
  if (found) activeName = found.name;
  else { profiles = [...profiles, createProfile(name)]; activeName = name; }
  persist();
  render();
});

render();
