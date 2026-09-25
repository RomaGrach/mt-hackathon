export const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
export const names = {
  empathy: 'Эмпатия',
  protocol: 'Регламент',
  speed: 'Реакция',
  teamwork: 'Командная работа',
};
const date = (v) =>
  new Date(v).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
const button = (text, action, extra = '', type = 'primary-button') =>
  `<button class="${type}" data-action="${action}" ${extra}>${text}</button>`;
const title = (kicker, text, description = '') =>
  `<section class="page-heading"><div class="eyebrow"><span class="eyebrow-line"></span>${kicker}</div><h1 tabindex="-1">${text}</h1>${description ? `<p>${description}</p>` : ''}</section>`;
const meter = (value, label, type = 'loyalty') =>
  `<div class="metric metric-small"><div class="metric-top"><span>${label}</span><strong>${value}%</strong></div><div class="meter" role="meter" aria-label="${label}" aria-valuenow="${value}" aria-valuemin="0" aria-valuemax="100"><span class="meter-fill ${type}" style="width:${value}%"></span></div></div>`;
const badge = (text, cls = '') => `<span class="tag ${cls}">${text}</span>`;
const crewName = (boot) => boot.crews.find((c) => c.id === boot.profile.crew)?.name || '';
const delta = (v) => (v > 0 ? '+' : '') + v;
const warning = `<div class="bottom-note"><span>ⓘ</span><p>Синтетическая учебная среда. Игровые оценки и диалоги требуют согласования с перевозчиком. Медицинский модуль тренирует организацию помощи, а не лечение.</p></div>`;

export function welcome() {
  return `<div class="welcome"><div class="welcome-brand">РЕЙС <em>400</em><span>ТРЕНАЖЁР РЕШЕНИЙ</span></div><div class="welcome-grid"><section><div class="eyebrow">ВАША СМЕНА НАЧИНАЕТСЯ ЗДЕСЬ</div><h1 tabindex="-1">Скорость поезда — 400.<br>Скорость решения — <em>ваша.</em></h1><p>Пять ситуаций на борту. Нелинейные диалоги, ограниченное время и последствия, которые нельзя отменить одним хорошим ответом.</p><div class="welcome-points"><span>01 · Оцените ситуацию</span><span>02 · Примите решение</span><span>03 · Разберите последствия</span></div></section><section class="onboarding panel"><div class="side-label">ПОДГОТОВКА К РЕЙСУ</div><h2>Создайте учебный профиль</h2><p>Псевдоним будет создан автоматически. Не вводите имена, контакты или другие персональные данные.</p><form id="join-form"><label for="crew">Учебная бригада</label><select id="crew" name="crew"><option value="msk-1">Бригада М-01 · Москва</option><option value="msk-2">Бригада М-02 · Москва</option><option value="spb-1">Бригада П-01 · Петербург</option><option value="spb-2">Бригада П-02 · Петербург</option></select><button class="primary-button" type="submit">Войти в учебный рейс <span>↗</span></button></form><small>Профиль и прохождения хранятся на этом сервере. Сессия — 7 дней. После выхода нужен новый демопрофиль; это не корпоративная авторизация.</small></section></div>${warning}</div>`;
}

function shell(content, model) {
  const { boot, view } = model;
  const p = boot.profile;
  const unread = boot.notices.filter((n) => !n.readAt).length;
  const nav = [
    ['home', '▦', 'Моя смена'],
    ['profile', '◉', 'Навыки и профиль'],
    ['leaderboard', '▤', 'Рейтинг'],
    ['notices', '◇', 'Уведомления'],
  ];
  return `<div class="app-shell"><aside class="sidebar"><button class="brand" data-action="nav" data-view="home"><span class="brand-mark"><span></span><span></span></span><span class="brand-name">РЕЙС<span>400</span><small>ТРЕНАЖЁР ВСМ</small></span></button><div class="nav-group-label">РАБОЧЕЕ ПРОСТРАНСТВО</div><nav aria-label="Главное меню">${nav.map(([id, icon, label]) => `<button class="nav-item ${view === id ? 'active' : ''}" data-action="nav" data-view="${id}" aria-current="${view === id ? 'page' : 'false'}"><span class="nav-icon">${icon}</span><span>${label}</span>${id === 'notices' && unread ? `<b class="notice-count">${unread}</b>` : ''}</button>`).join('')}</nav><div class="sidebar-bottom"><div class="rail-decor"><span>СКОРОСТЬ РЕШЕНИЯ<br><strong>ИМЕЕТ ЗНАЧЕНИЕ</strong></span></div><button class="mini-profile" data-action="nav" data-view="profile"><span class="avatar">${p.level}</span><span class="mini-profile-text"><strong>${esc(p.name)}</strong><small>${p.totalPoints} очков · уровень ${p.level}</small></span></button></div></aside><div class="workspace"><header class="topbar"><div class="crumb"><span class="crumb-dot"></span>${esc(crewName(boot))} / УЧЕБНЫЙ РЕЙС</div><div class="topbar-right"><span class="live-pill"><span></span>СЕРВЕРНЫЙ ПРОГРЕСС</span><button class="bell" data-action="nav" data-view="notices" aria-label="Уведомления: ${unread} непрочитанных">◇ ${unread || ''}</button></div></header><main id="main">${content}</main></div></div>`;
}

function home(model) {
  const { boot, run } = model;
  const p = boot.profile;
  const next = boot.catalog.find((s) => !p.completed.includes(s.id)) || boot.catalog[0];
  const activeId = run && run.phase !== 'result' ? run.id : boot.activeRun?.id;
  const complete = p.completed.length === boot.catalog.length;
  return `<section class="hero"><div class="hero-copy"><div class="eyebrow"><span class="eyebrow-line"></span>ВАШ УЧЕБНЫЙ РЕЙС</div><h1 tabindex="-1">${complete ? 'Смена пройдена.<br><em>Мастерство</em> остаётся.' : 'Решения за секунды.<br><em>Уверенность</em> на маршруте.'}</h1><p>${complete ? 'Все пять модулей зачтены. Изучите аналитику и попробуйте другие развилки в режиме практики.' : 'От спокойного диалога до срочного вызова помощи. Научитесь держать баланс сервиса и безопасности.'}</p>${activeId ? button('Продолжить попытку ↗', 'resume', `data-id="${activeId}"`) : button(complete ? 'Улучшить результат ↗' : 'Начать смену ↗', 'brief', `data-id="${next.id}"`)}</div><div class="hero-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="train-shape"><span class="train-window"></span><span class="train-window"></span><span class="train-window"></span><span class="train-window"></span></div><div class="speed-tag"><small>РЕШЕНИЯ НА БОРТУ</small><strong>400<span>км/ч</span></strong></div><div class="art-grid"></div></div></section>
  <div class="section-title-row"><div><div class="eyebrow muted">ПАНЕЛЬ ПРОВОДНИКА</div><h2>Ваш прогресс</h2></div>${badge('Уровень ' + p.level)}</div><section class="stats-grid"><div class="stat-card"><span class="stat-icon violet-icon">◈</span><strong>${p.totalPoints}</strong><span>Очков компетенций</span><small>Лучший зачёт каждого модуля</small></div><div class="stat-card"><span class="stat-icon coral-icon">◎</span><strong>${p.completed.length}<i> / ${boot.catalog.length}</i></strong><span>Ситуаций освоено</span><small>Критическая ошибка исключает зачёт</small></div><div class="stat-card"><span class="stat-icon mint-icon">✦</span><strong>${p.achievements.length}<i> / ${boot.achievements.length}</i></strong><span>Достижений открыто</span><small>Навыки, а не число кликов</small></div></section>
  <section class="route-panel"><div><div class="eyebrow muted">КАРТА УЧЕБНОЙ СМЕНЫ</div><h2>Пять вызовов. Один экипаж.</h2><p>Порядок свободный. Отмеченные модули уже зачтены.</p></div><div class="shift-route">${boot.catalog.map((s) => `<button data-action="brief" data-id="${s.id}" class="route-stop ${p.completed.includes(s.id) ? 'done' : ''}"><span>${p.completed.includes(s.id) ? '✓' : s.icon}</span><small>ВАГОН ${s.carriage}</small><strong>${esc(s.title)}</strong></button>`).join('')}</div></section>
  <section class="challenge"><span class="challenge-icon">✧</span><div><div class="eyebrow">ЧЕЛЛЕНДЖ НЕДЕЛИ</div><h3>${esc(boot.challenge.title)}</h3><p>${boot.challenge.progress} / ${boot.challenge.target} · до ${date(boot.challenge.endsAt)} · +${boot.challenge.reward} сезонных бонусов</p></div><strong>${boot.challenge.completed ? 'Выполнено ✓' : 'Примите вызов'}</strong></section>
  <div class="section-title-row"><div><div class="eyebrow muted">ТРЕНИРОВОЧНЫЕ МОДУЛИ</div><h2>Выберите ситуацию</h2></div><span class="section-subtitle">У каждого решения — свой след</span></div><section class="scenario-grid">${boot.catalog.map((s) => `<article class="scenario-card ${s.accent}"><div class="scenario-card-top"><span class="scenario-number">СЦЕНАРИЙ ${s.number}</span><span class="scenario-icon">${s.icon}</span></div><div class="scenario-category">${esc(s.category)}</div><h3>${esc(s.title)}</h3><p>${esc(s.summary)}</p><div class="scenario-tags"><span>${s.duration}</span><span>${s.endings} исхода</span>${p.best[s.id] ? `<span>Лучший: ${p.best[s.id]}</span>` : ''}</div><button class="scenario-start" data-action="brief" data-id="${s.id}">${p.completed.includes(s.id) ? 'Улучшить результат' : 'Открыть задание'} <span>↗</span></button></article>`).join('')}</section>${warning}`;
}

function briefing(model) {
  const s = model.boot.catalog.find((s) => s.id === model.brief);
  return `${button('← К смене', 'nav', 'data-view="home"', 'text-back')}<section class="brief-grid"><div>${title('БРИФИНГ / ВАГОН ' + s.carriage, esc(s.title), esc(s.summary))}<div class="panel"><div class="side-label">ВАША ЗАДАЧА</div><h2>${esc(s.objective)}</h2><p>Сначала признайте ситуацию, затем обозначьте правило, предложите выполнимое решение и подтвердите следующий шаг.</p><div class="context-tags">${s.skills.map((skill) => badge(esc(skill))).join('')}</div></div><div class="panel brief-rules"><h3>Правила попытки</h3><p><strong>Безопасность ≥ 65, лояльность ≥ 55.</strong> Критическая ошибка исключает зачёт при любых очках.</p><p>Сервер проверяет время даже после обновления или закрытия страницы. На экране разбора следующий таймер ещё не идёт.</p><p>Рейтинг учитывает лучший зачёт по сценарию. Практика сохраняется отдельно и не даёт рейтинговых очков.</p></div></div><aside class="panel launch-card"><span class="launch-icon ${s.accent}">${s.icon}</span><div class="side-label">ДЛИТЕЛЬНОСТЬ</div><h2>${s.duration}</h2><p>${s.decisions} сцен в графе<br>${s.endings} возможных исхода<br>Версия ${s.version}</p>${button('Начать зачётную попытку ↗', 'start', `data-id="${s.id}"`)}${button('Изучить в практике', 'start', `data-id="${s.id}" data-practice="true"`, 'outline-button')}<small>Практика тоже использует таймер. Вызов ответственных сотрудников всегда доступен и не расходует ресурс коллеги.</small></aside></section>${warning}`;
}

function railScene(run) {
  return `<div class="carriage-scene" aria-hidden="true"><div class="moving-landscape"></div><div class="carriage-windows"><i></i><i></i><i></i></div><div class="carriage-seats"><i></i><i></i><i></i><i class="seat-event">${run.scenario.icon}</i><i></i><i></i></div><span class="carriage-caption">ВАГОН ${run.scenario.carriage} · УЧЕБНАЯ СИТУАЦИЯ</span></div>`;
}
function runView(model) {
  const r = model.run;
  if (!r) return '<p>Загружаем попытку…</p>';
  if (r.phase === 'feedback') return feedback(r);
  if (r.phase === 'result') return result(r, model);
  return `<div class="game-topline">${button('← К смене', 'nav', 'data-view="home"', 'text-back')}<span class="game-stage">РЕШЕНИЕ ${String(r.history.length + 1).padStart(2, '0')} · ${r.practice ? 'ПРАКТИКА' : 'ЗАЧЁТ'}</span></div><div class="game-layout"><section class="game-main"><div class="scene-header"><div class="eyebrow">${esc(r.scenario.category)} / ВАГОН ${r.scenario.carriage}</div><h1 tabindex="-1">${esc(r.scenario.title)}</h1></div>${railScene(r)}<div class="scene-card"><div class="scene-card-head"><span class="pulse-icon">${r.scenario.icon}</span><div><span class="scene-person">${esc(r.node.speaker)}</span><small>${esc(r.node.label)}</small></div><span class="scene-live"><i></i> СЕЙЧАС</span></div><blockquote>${esc(r.node.text)}</blockquote></div><div class="decision-heading"><div><div class="eyebrow muted">ВАШ ХОД</div><h2>${esc(r.node.prompt)}</h2></div><span>Клавиши 1–4</span></div>${r.deadline ? `<div class="timer-block"><div class="timer-label"><span>⏱ СРОЧНОЕ РЕШЕНИЕ</span><strong id="timer-number" aria-label="Осталось секунд">${r.node.timer}</strong></div><div class="timer-meter"><span id="timer-meter"></span></div><small>Закрытие страницы не останавливает время</small></div>` : '<div class="pace-label">Без ограничения времени · изучите ситуацию</div>'}<div class="options">${r.node.options.map((o, i) => `<button class="option" data-action="choose" data-id="${o.id}" ${o.available ? '' : 'disabled'}><span class="option-index">${i + 1}</span><span class="option-copy"><strong>${esc(o.title)}</strong><small>${esc(o.available ? o.description : '🔒 ' + o.requirement)}</small></span><span class="option-arrow">${o.available ? '↗' : '—'}</span></button>`).join('')}</div></section><aside class="game-side"><div class="side-card"><div class="side-label">СОСТОЯНИЕ СИТУАЦИИ</div>${meter(r.loyalty, 'Лояльность пассажира')}${meter(r.safety, 'Рейтинг безопасности', 'safety')}<div class="points-line"><span>Очки этой попытки</span><strong>${r.points}</strong></div>${r.criticalError ? '<div class="critical-notice">Критическая ошибка уже допущена. Продолжите, чтобы разобрать последствия.</div>' : ''}</div><div class="side-card"><div class="side-label">РЕСУРС ЭКИПАЖА</div><h3>${r.resources.colleague ? '◉ Коллега свободен' : '○ Коллега задействован'}</h3><p>Одна дополнительная помощь с сопровождением или сервисом. Экстренная связь не ограничена.</p></div><div class="side-card"><div class="side-label">ЦЕЛЬ</div><p>${esc(r.scenario.objective)}</p>${button('Прервать попытку', 'abort', '', 'text-back')}</div></aside></div>`;
}
function impacts(entry) {
  return `<div class="impact-grid">${[
    ['loyalty', 'Лояльность'],
    ['safety', 'Безопасность'],
    ['points', 'Очки'],
  ]
    .map(
      ([key, label]) =>
        `<div><span>${label}</span><strong class="${entry.impact[key] >= 0 ? 'positive' : 'negative'}">${delta(entry.impact[key])}</strong></div>`
    )
    .join('')}</div>`;
}
function feedback(r) {
  const h = r.history.at(-1);
  return `<div class="focus-page"><div class="focus-kicker">ВАГОН ${r.scenario.carriage} · ПОСЛЕДСТВИЯ РЕШЕНИЯ</div><div class="feedback-symbol">${h.timedOut ? '⌛' : '✦'}</div><div class="eyebrow muted">${h.timedOut ? 'ВРЕМЯ ВЫШЛО' : 'РЕШЕНИЕ ПРИНЯТО'}</div><h1 tabindex="-1">${h.timedOut ? 'Бездействие тоже меняет исход' : 'Ваш выбор изменил ситуацию'}</h1><p class="focus-lead">${esc(h.feedback)}</p>${h.critical ? '<div class="critical-notice">Критическая ошибка: зачёт за эту попытку невозможен.</div>' : ''}<div class="chosen-box"><small>ВАШЕ ДЕЙСТВИЕ</small><strong>${esc(h.title)}</strong></div>${impacts(h)}${button(r.finished ? 'Открыть полный разбор ↗' : 'Следующая ситуация ↗', 'continue')}<p class="feedback-pause">Разберите последствие. Следующий таймер начнётся только после продолжения.</p></div>`;
}
function result(r, model) {
  const x = r.result;
  const p = model.boot.profile;
  return `<section class="result-page"><div class="result-ribbon">СЦЕНАРИЙ ЗАВЕРШЁН · ${r.practice ? 'ПРАКТИКА БЕЗ РЕЙТИНГА' : 'РЕЗУЛЬТАТ СОХРАНЁН НА СЕРВЕРЕ'}</div><div class="result-inner"><div class="result-medal">${x.passed ? '✦' : '↗'}</div><div class="eyebrow muted">${esc(r.scenario.title)} · ${esc(x.scenarioVersion)}</div><h1 tabindex="-1">${esc(x.ending.title)}</h1><p>${esc(x.ending.text)}</p><span class="grade-pill">${x.grade}</span>${!x.passed ? `<div class="critical-notice">${x.criticalError ? 'Критическая ошибка безопасности исключила зачёт.' : 'Попытка прервана или показатели ниже порогов: безопасность 65, лояльность 55.'}</div>` : ''}<div class="result-score"><strong>${x.points}</strong><span>ОЧКОВ В ЭТОЙ ПОПЫТКЕ</span></div><p class="score-explanation">${r.practice ? 'Режим практики: результат не увеличивает рейтинг.' : x.passed ? `В рейтинге — лучший зачёт этого модуля: ${p.best[x.scenarioId] || x.points}. Повторные очки не суммируются.` : 'Незачёт сохранён для обучения, но не добавляет рейтинговых очков.'}</p><div class="result-metrics">${meter(x.loyalty, 'Лояльность пассажира')}${meter(x.safety, 'Рейтинг безопасности', 'safety')}</div><div class="result-skills">${Object.entries(
    x.competencies
  )
    .filter(([, n]) => n)
    .map(([k, n]) => `<span>+${n} ${names[k]}</span>`)
    .join(
      ''
    )}</div><div class="debrief"><div class="debrief-head"><div><small>РАЗБОР КАЖДОГО РЕШЕНИЯ</small><h2>Что произошло и почему</h2></div></div>${x.history.map((h, i) => `<article class="debrief-step"><span class="debrief-index">${String(i + 1).padStart(2, '0')}</span><div class="debrief-content"><h3>${esc(h.title)}</h3><p>${esc(h.feedback)}</p><div class="debrief-meta">${badge(h.timedOut ? 'Таймаут' : (h.responseMs / 1000).toFixed(1) + ' с')}${h.critical ? badge('Критическая ошибка', 'danger') : ''}<span>Лояльность: ${h.before.loyalty} → ${h.after.loyalty}</span><span>Безопасность: ${h.before.safety} → ${h.after.safety}</span><span>${delta(h.impact.points)} очков</span></div>${h.alternative ? `<div class="alternative"><strong>Другой подход: ${esc(h.alternative.title)}</strong><p>${esc(h.alternative.feedback)}</p></div>` : '<div class="choice-positive">В этой сцене выбран рекомендуемый подход.</div>'}${button('Проверить другую развилку', 'replay', `data-index="${i}"`, 'text-back')}</div></article>`).join('')}</div><div class="result-actions">${button('Продолжить смену ↗', 'nav', 'data-view="home"')}${button('Мои навыки', 'nav', 'data-view="profile"', 'outline-button')}${button('Пройти с начала', 'brief', `data-id="${r.scenarioId}"`, 'outline-button')}</div></div></section>`;
}

function profile(model) {
  const b = model.boot;
  const p = b.profile;
  const a = p.analytics;
  return `${title('ЛИЧНЫЙ КАБИНЕТ', 'Навыки растут в действии', 'Аналитика учитывает и успешные решения, и ошибки. Практика показана отдельно.')}<div class="profile-layout"><section class="profile-main"><div class="profile-identity"><div class="profile-avatar">${p.level}</div><div><div class="eyebrow muted">УЧЕБНЫЙ ПРОФИЛЬ</div><h2>${esc(p.name)}</h2><span>${esc(p.depot)} · ${esc(crewName(b))}</span></div><div class="identity-score"><strong>${p.totalPoints}</strong><span>ОЧКОВ</span></div></div><div class="panel"><div class="panel-header"><h3>Уровень ${p.level}</h3><span>До следующего: ${p.nextLevelAt - p.totalPoints} очков</span></div><div class="level-track"><span style="width:${p.levelProgress / 3}%"></span></div><p>${p.completed.length} из ${b.catalog.length} модулей зачтено · ${p.seasonPoints} сезонных бонусов</p>${p.bonuses.map((x) => `<small class="bonus-line">+${x.amount} · ${esc(x.reason)} · до ${date(x.expiresAt)}</small>`).join('')}</div><div class="panel"><div class="panel-header"><h3>Карта компетенций</h3><span>Последние ${a.sampleSize} попыток</span></div>${a.skills.map((s) => `<div class="skill-evidence"><div class="skill-row"><span>${names[s.key]}</span><div class="skill-bar"><span style="width:${s.percent || 0}%"></span></div><strong>${s.percent === null ? '—' : s.percent + '%'}</strong></div><small>${s.decisions} решений с наблюдениями · ${s.earned} / ${s.possible} доступных единиц</small><p>${esc(s.advice)}</p></div>`).join('')}<div class="analytics-summary"><span>Таймауты: <strong>${a.timeouts} / ${a.timedDecisions}</strong></span><span>Средняя реакция: <strong>${a.averageReactionSeconds === null ? 'нет данных' : a.averageReactionSeconds + ' с'}</strong></span><span>Критические ошибки: <strong>${a.criticalAttempts}</strong></span></div><small>${esc(a.explanation)}</small></div><div class="panel"><div class="panel-header"><h3>Рекомендованная практика</h3></div>${a.recommended.length ? a.recommended.map((id) => button(esc(b.catalog.find((s) => s.id === id).title) + ' ↗', 'brief', `data-id="${id}"`, 'recommendation')).join('') : '<p>Пока нет выраженного пробела. Пройдите ещё один сценарий или изучите альтернативную ветку.</p>'}</div><div class="panel"><div class="panel-header"><h3>Динамика решений</h3><span>Лояльность / безопасность</span></div>${a.trend.length ? `<div class="trend-chart" role="img" aria-label="Динамика показателей последних попыток">${a.trend.map((x) => `<div class="trend-item"><div class="trend-bars"><span class="loyalty" style="height:${x.loyalty}%" title="Лояльность ${x.loyalty}"></span><span class="safety" style="height:${x.safety}%" title="Безопасность ${x.safety}"></span></div><small>${x.loyalty} / ${x.safety}</small></div>`).join('')}</div>` : '<p>Динамика появится после завершения попытки.</p>'}</div><div class="panel"><div class="panel-header"><h3>История и разбор</h3><span>${a.attempts} попыток + ${a.practiceAttempts} практик</span></div>${p.history.length ? p.history.map((x) => `<button class="history-row history-button" data-action="history" data-id="${x.runId}"><div><strong>${esc(x.title)}</strong><span>${date(x.completedAt)} · ${x.practice ? 'Практика' : x.grade}</span></div><div><strong>${x.points}</strong><span>Открыть разбор ↗</span></div></button>`).join('') : '<p>Здесь появятся завершённые попытки.</p>'}</div></section><aside class="profile-side"><div class="panel"><div class="panel-header"><h3>Достижения</h3><span>${p.achievements.length} / ${b.achievements.length}</span></div>${b.achievements.map((x) => `<div class="achievement ${p.achievements.includes(x.id) ? 'unlocked' : ''}"><span>${x.icon}</span><div><strong>${esc(x.title)}</strong><small>${esc(x.description)}</small></div></div>`).join('')}</div><div class="panel settings"><h3>Настройки профиля</h3><form id="crew-form"><label for="profile-crew">Учебная бригада</label><select id="profile-crew" name="crew">${b.crews.map((c) => `<option value="${c.id}" ${p.crew === c.id ? 'selected' : ''}>${esc(c.name)} · ${esc(c.depot)}</option>`).join('')}</select><button class="outline-button" type="submit">Сохранить бригаду</button></form>${button('Экспорт моих данных', 'export', '', 'outline-button')}${button('Выйти из профиля', 'logout', '', 'outline-button')}${button('Удалить профиль и историю', 'delete', '', 'text-back danger-text')}<small>В демо нет восстановления входа. Выход завершает сессию; удаление также стирает серверные данные этого профиля.</small></div></aside></div>`;
}

function leaders(model) {
  const x = model.leaders;
  return `${title('ОБЩИЙ РЕЙТИНГ', 'Мастерство видно в действиях', 'Результаты хранятся на сервере и доступны всем участникам этой учебной среды. Только синтетические профили.')}<div class="leader-intro"><div><span class="leader-icon">★</span><h2>Качество, не количество попыток</h2><p>Учитывается лучший зачёт каждого сценария. Практика, незачёты и сезонные бонусы не добавляют очков в этот рейтинг.</p></div><div class="leader-total"><strong>${x?.myRank || '—'}</strong><span>ВАШЕ МЕСТО</span></div></div><div class="tabs" role="group" aria-label="Область рейтинга">${[
    ['crew', 'Бригада'],
    ['depot', 'Депо'],
    ['company', 'Компания'],
  ]
    .map(([id, label]) =>
      button(
        label,
        'scope',
        `data-id="${id}" aria-pressed="${model.scope === id}"`,
        'tab ' + (model.scope === id ? 'active' : '')
      )
    )
    .join(
      ''
    )}</div>${x ? `<p class="muted-text">${esc(x.scope === 'crew' ? crewName(model.boot) : x.group)} · ${x.total} участников</p><div class="leader-table"><div class="leader-table-head"><span>МЕСТО / УЧАСТНИК</span><span>СЦЕНАРИИ</span><span>ОЧКИ</span></div>${x.rows.map((r) => `<div class="leader-row ${r.me ? 'is-me' : ''}"><div><span class="rank ${r.rank <= 3 ? 'top-rank' : ''}">${String(r.rank).padStart(2, '0')}</span><span class="avatar small-avatar">${r.rank <= 3 ? '✦' : '◈'}</span><strong>${esc(r.name)}${r.me ? '<small>ВЫ</small>' : ''}</strong></div><span class="leader-completed">${r.completed} / ${x.scenarioCount}</span><strong class="leader-score">${r.score}</strong></div>`).join('')}</div><p class="muted-text">Показаны первые 50 мест. Рейтинг без вымышленных результатов: новые профили начинают с нуля.</p>` : '<p>Загружаем рейтинг…</p>'}`;
}
function notices(model) {
  return `${title('ПУЛЬС ОБУЧЕНИЯ', 'Уведомления', 'Новые ситуации, достижения, челленджи и сроки действия сезонных бонусов.')}<div class="notice-actions">${button('Отметить всё прочитанным', 'read-all', '', 'outline-button')}</div><section class="notice-list">${model.boot.notices.map((n) => `<article class="panel notification ${n.readAt ? '' : 'unread'}"><span class="notification-icon">${{ scenario: '◇', challenge: '✧', achievement: '✦', expiry: '⌛' }[n.kind]}</span><div><small>${date(n.at)} ${n.readAt ? '· прочитано' : '· новое'}</small><h3>${esc(n.title)}</h3><p>${esc(n.body)}</p>${n.target ? button('Открыть ситуацию ↗', 'brief', `data-id="${n.target}"`, 'text-back') : ''}</div></article>`).join('')}</section>`;
}

export function render(model) {
  const content = !model.boot
    ? welcome()
    : shell(
        model.view === 'brief'
          ? briefing(model)
          : model.view === 'run'
            ? runView(model)
            : model.view === 'profile'
              ? profile(model)
              : model.view === 'leaderboard'
                ? leaders(model)
                : model.view === 'notices'
                  ? notices(model)
                  : home(model),
        model
      );
  return `${content}${model.error ? `<div class="error-toast" role="alert"><strong>${esc(model.error)}</strong>${button('Обновить состояние', 'refresh', '', 'outline-button')}${button('Закрыть', 'dismiss', '', 'text-back')}</div>` : ''}<div class="busy-indicator ${model.busy ? 'visible' : ''}" role="status">Синхронизация с сервером…</div>`;
}
