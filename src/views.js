import { designProfile, designLeaders } from './design002-view.js';
import { adminView } from './admin-view.js';
import * as ux from './ux.js';
import { renderShift, sheet } from './shift-view.js';
import { motivationProfile, motivationLeaders, shiftResultControls } from './motivation-view.js';
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
  return ux.welcome();
}

function shell(content, model) {
  return ux.shell(content, model);
}

function home(model) {
  return ux.home(model);
}

function briefing(model) {
  return ux.briefing(model);
}

function runView(model) {
  const r = model.run;
  if (!r) return '<p role="status">Восстанавливаем попытку…</p>';
  if (r.schemaVersion === 2)
    return (
      renderShift(r, { embedded: true, ui: model }) +
      (r.engineVersion === 'shift-4' ? '' : shiftResultControls(r)) +
      (model.auditMessage ? '<p role="status">' + esc(model.auditMessage) + '</p>' : '')
    );
  if (r.phase === 'feedback') return ux.feedback(r);
  if (r.phase === 'result') return result(r, model);
  return ux.decision(model);
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

function legacyProfile(model) {
  const b = model.boot;
  const p = b.profile;
  const a = p.analytics;
  return `${title('ЛИЧНЫЙ КАБИНЕТ', 'Ваши навыки и прогресс', 'Аналитика учитывает и успешные решения, и ошибки. Практика показана отдельно.')}<div class="profile-layout"><section class="profile-main"><div class="profile-identity"><div class="profile-avatar">${p.level}</div><div><div class="eyebrow muted">УЧЕБНЫЙ ПРОФИЛЬ</div><h2>${esc(p.name)}</h2><span>${esc(p.depot)} · ${esc(crewName(b))}</span></div><div class="identity-score"><strong>${p.totalPoints}</strong><span>ОЧКОВ</span></div></div><div class="panel"><div class="panel-header"><h3>Уровень ${p.level}</h3><span>До следующего: ${p.nextLevelAt - p.totalPoints} очков</span></div><div class="level-track"><span style="width:${p.levelProgress / 3}%"></span></div><p>${p.completed.length} из ${b.catalog.length} модулей зачтено · ${p.seasonPoints} сезонных бонусов</p>${p.bonuses.map((x) => `<small class="bonus-line">+${x.amount} · ${esc(x.reason)} · до ${date(x.expiresAt)}</small>`).join('')}</div><div class="panel"><div class="panel-header"><h3>Карта компетенций</h3><span>Последние ${a.sampleSize} попыток</span></div>${a.skills.map((s) => `<div class="skill-evidence"><div class="skill-row"><span>${names[s.key]}</span><div class="skill-bar"><span style="width:${s.percent || 0}%"></span></div><strong>${s.percent === null ? '—' : s.percent + '%'}</strong></div><small>${s.decisions} решений с наблюдениями · ${s.earned} / ${s.possible} доступных единиц</small><p>${esc(s.advice)}</p></div>`).join('')}<div class="analytics-summary"><span>Таймауты: <strong>${a.timeouts} / ${a.timedDecisions}</strong></span><span>Средняя реакция: <strong>${a.averageReactionSeconds === null ? 'нет данных' : a.averageReactionSeconds + ' с'}</strong></span><span>Критические ошибки: <strong>${a.criticalAttempts}</strong></span></div><small>${esc(a.explanation)}</small></div><div class="panel"><div class="panel-header"><h3>Рекомендованная практика</h3></div>${a.recommended.length ? a.recommended.map((id) => button(esc(b.catalog.find((s) => s.id === id).title) + ' ↗', 'brief', `data-id="${id}"`, 'recommendation')).join('') : '<p>Пока нет выраженного пробела. Пройдите ещё один сценарий или изучите альтернативную ветку.</p>'}</div><div class="panel"><div class="panel-header"><h3>Динамика решений</h3><span>Лояльность / безопасность</span></div>${a.trend.length ? `<div class="trend-chart" role="group" aria-label="Динамика: лояльность и безопасность последних попыток">${a.trend.map((x) => `<div class="trend-item"><div class="trend-bars"><span class="loyalty" style="height:${x.loyalty}%" title="Лояльность ${x.loyalty}"></span><span class="safety" style="height:${x.safety}%" title="Безопасность ${x.safety}"></span></div><small>${x.loyalty} / ${x.safety}</small></div>`).join('')}</div>` : '<p>Динамика появится после завершения попытки.</p>'}</div><div class="panel"><div class="panel-header"><h3>История и разбор</h3><span>${a.attempts} попыток + ${a.practiceAttempts} практик</span></div>${p.history.length ? p.history.map((x) => `<button class="history-row history-button" data-action="history" data-id="${x.runId}"><div><strong>${esc(x.title)}</strong><span>${date(x.completedAt)} · ${x.practice ? 'Практика' : x.grade}</span></div><div><strong>${x.points}</strong><span>Открыть разбор ↗</span></div></button>`).join('') : '<p>Здесь появятся завершённые попытки.</p>'}</div></section><aside class="profile-side"><div class="panel"><div class="panel-header"><h3>Достижения</h3><span>${p.achievements.length} / ${b.achievements.length}</span></div>${b.achievements.map((x) => `<div class="achievement ${p.achievements.includes(x.id) ? 'unlocked' : ''}"><span>${x.icon}</span><div><strong>${esc(x.title)}</strong><small>${p.achievements.includes(x.id) ? 'Получено' : 'Пока не получено'}</small><small>${esc(x.description)}</small></div></div>`).join('')}</div><div class="panel settings"><h3>Настройки профиля</h3><p class="muted-text">Бригада назначается учебному профилю и используется только для сопоставимого рейтинга.</p>${button('Экспорт моих данных', 'export', '', 'outline-button')}${button('Выйти из профиля', 'logout', '', 'outline-button')}${button('Удалить профиль и историю', 'delete', '', 'text-back danger-text')}<small>В демо нет восстановления входа. Выход завершает сессию; удаление также стирает серверные данные этого профиля.</small></div></aside></div>`;
}

function legacyLeaders(model) {
  const x = model.leaders;
  return `${title('ОБЩИЙ РЕЙТИНГ', 'Рейтинг учебных результатов', 'Результаты хранятся на сервере и доступны всем участникам этой учебной среды. Только синтетические профили.')}<div class="leader-intro"><div><span class="leader-icon">★</span><h2>Качество, не количество попыток</h2><p>Учитывается лучший зачёт каждого сценария. Практика, незачёты и сезонные бонусы не добавляют очков в этот рейтинг.</p></div><div class="leader-total"><strong>${x?.myRank || '—'}</strong><span>ВАШЕ МЕСТО</span></div></div><div class="tabs" role="group" aria-label="Область рейтинга">${[
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
function profile(model) {
  if (model.boot.competency) return designProfile(model);
  if (!model.boot.motivation) return legacyProfile(model);
  const old = legacyProfile(model),
    at = old.lastIndexOf('<div class="panel settings">'),
    end = old.lastIndexOf('</aside>');
  const settings = old.slice(at, end),
    legacy = old.slice(0, at) + old.slice(end);
  return (
    motivationProfile(model) +
    '<div class="reading-column">' +
    '<button class="learn-entry" data-open-sheet="settings">⚙ Настройки профиля →</button>' +
    sheet('settings', 'Настройки профиля', settings) +
    '<details class="panel" data-disclosure="legacy-profile"><summary>История, баллы и достижения отдельных сценариев v1</summary><p>Архивная система не прибавляется к XP и СП новой смены.</p>' +
    legacy.replaceAll('<h1', '<h2').replaceAll('</h1>', '</h2>') +
    '</details></div>'
  );
}
function leaders(model) {
  if (model.boot.competency) return designLeaders(model);
  if (!model.boot.motivation) return legacyLeaders(model);
  const legacy = legacyLeaders(model)
    .replace(/<div class="tabs"[^>]*>[\s\S]*?<\/div>/, '')
    .replaceAll('<h1', '<h2')
    .replaceAll('</h1>', '</h2>');
  return (
    motivationLeaders(model) +
    '<details class="panel" data-disclosure="legacy-rating"><summary>Отдельный архивный рейтинг сценариев v1</summary><p>Это прежние баллы по модулям, а не недельное соревнование новой смены.</p>' +
    legacy +
    '</details>'
  );
}
function notices(model) {
  if (!model.boot.notices.length)
    return `${title('УВЕДОМЛЕНИЯ', 'Пока нет новых сообщений', 'Здесь появятся новые ситуации, достижения и изменения сроков.')}<section class="panel"><p>Ничего не пропущено. Можно вернуться к учебной попытке.</p>${button('К занятиям', 'nav', 'data-view="home"', 'outline-button')}</section>`;
  const unread = model.boot.notices.filter((n) => !n.readAt).length;
  const ordered = [...model.boot.notices].sort((a, b) => Number(!!a.readAt) - Number(!!b.readAt));
  return `${title('ПУЛЬС ОБУЧЕНИЯ', 'Уведомления', `Непрочитанных: ${unread}. Новые ситуации, достижения, челленджи и сроки действия сезонных бонусов.`)}${unread ? `<div class="notice-actions">${button('Отметить всё прочитанным', 'read-all', '', 'outline-button')}</div>` : ''}<section class="notice-list">${ordered.map((n) => `<article class="panel notification ${n.readAt ? '' : 'unread'}"><span class="notification-icon">${{ scenario: '◇', challenge: '✧', achievement: '✦', expiry: '⌛', review: '↗' }[n.kind]}</span><div><small>${date(n.at)} ${n.readAt ? '· прочитано' : '· новое'}</small><h3>${esc(n.title)}</h3><p>${esc(n.body)}</p>${n.target ? button('Открыть ситуацию ↗', 'brief', `data-id="${n.target}"`, 'text-back') : ''}</div></article>`).join('')}</section>`;
}

export function render(model) {
  const content =
    model.view === 'admin'
      ? '<main id="main" class="standalone-admin">' + adminView(model.admin) + '</main>'
      : !model.boot && !model.sessionKnown
        ? '<main id="main" class="loading-page"><h1 tabindex="-1">Открываем учебный рейс…</h1><p>Проверяем сессию и сохранённый прогресс. При ошибке используйте обновление состояния.</p></main>'
        : !model.boot
          ? welcome()
          : shell(
              model.view === 'admin'
                ? adminView(model.admin)
                : model.view === 'landing'
                  ? ux.roleLanding(model)
                  : model.view === 'brief'
                    ? briefing(model)
                    : model.view === 'run'
                      ? runView(model)
                      : model.view === 'profile'
                        ? profile(model)
                        : model.view === 'leaderboard'
                          ? leaders(model)
                          : model.view === 'notices'
                            ? home(model)
                            : home(model),
              model
            );
  const error = model.error
    ? '<section class="error-toast" role="alert" aria-label="Действие требует проверки"><strong>' +
      esc(model.error) +
      '</strong>' +
      button('Обновить состояние', 'refresh', '', 'outline-button') +
      button('Закрыть сообщение', 'dismiss', '', 'text-back') +
      '</section>'
    : '';
  const connection = model.offline
    ? '<p class="connection-warning" role="status">Нет сети. Серверный таймер не остановлен. Дождитесь связи и обновите состояние.</p>'
    : '';
  return (
    '<a class="skip-link" href="#main">К содержимому</a>' +
    connection +
    '<span class="sr-only" role="status">' +
    (model.busy ? 'Сохранение' : '') +
    '</span>' +
    error +
    content
  );
}
