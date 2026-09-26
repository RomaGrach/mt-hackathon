import { esc, button, heading, scales, note } from './ui.js';
import { shiftHud, sheet, tutorialContent } from './shift-view.js';
import { shiftHome } from './motivation-view.js';

const brand = '<span class="wordmark">РЕЙС <b>400</b></span>';
const crewOptions =
  '<option value="msk-1">М-01 · Москва</option><option value="msk-2">М-02 · Москва</option><option value="spb-1">П-01 · Петербург</option><option value="spb-2">П-02 · Петербург</option>';

export function welcome() {
  return `<main id="main" class="welcome">${brand}<div class="welcome-grid"><section>${heading('Тренажёр проводника', 'Добро пожаловать на борт', 'Рабочие ситуации, ваши решения и разбор последствий.')}</section><section class="panel onboarding"><h2>Ваш профиль проводника</h2><p>Создайте учебный профиль, выберите смену и пройдите её от приёмки до разбора.</p><form id="join-form"><details data-disclosure="crew"><summary>Выбрать учебную бригаду</summary><label for="crew">Бригада</label><select id="crew" name="crew">${crewOptions}</select></details><button class="primary-button" type="submit">Войти как игрок</button></form><button class="outline-button admin-entry" data-action="nav" data-view="admin">▦ Администратор · все игроки</button><details data-disclosure="privacy"><summary>О профиле и сохранении</summary><p>Не вводите личные данные. Профиль хранится на сервере, сессия — 7 дней. После выхода восстановить вход в демо нельзя.</p>${note}</details></section></div></main>`;
}

export function shell(content, model) {
  const unread = model.boot.notices.filter((n) => !n.readAt).length;
  const items = [
    ['home', 'Моя смена'],
    ['profile', 'Навыки и профиль'],
    ['leaderboard', 'Рейтинг'],
    ['notices', 'Уведомления'],
    ['admin', 'Администратор'],
  ];
  return `<div class="app-shell ${model.view === 'run' ? 'playing-shell' : 'hub-shell'}"><header class="app-header ${model.view === 'run' ? 'game-header' : ''}">${model.view === 'run' ? '' : brand}${model.view === 'run' && model.run?.schemaVersion === 2 ? shiftHud(model.run) : ''}${model.view === 'run' && model.run?.schemaVersion === 2 ? '' : `<details class="site-menu" data-disclosure="menu"><summary>☰ Меню${unread ? `<span class="notice-count" aria-label="${unread} непрочитанных">${unread}</span>` : ''}</summary><nav aria-label="Главное меню">${items.map(([id, label]) => `<button class="nav-item ${model.view === id ? 'active' : ''}" data-action="nav" data-view="${id}" aria-label="${label}" ${model.view === id ? 'aria-current="page"' : ''}><span>${label}</span></button>`).join('')}</nav></details>`}</header><div class="workspace"><main id="main">${content}</main>${
    model.view !== 'run'
      ? `<nav class="hub-dock" aria-label="Разделы игры">${[
          ['home', '⌂', 'Главная'],
          ['profile', '◉', 'Профиль'],
          ['leaderboard', '♜', 'Рейтинг'],
          ['notices', '✉', 'Новости'],
        ]
          .map(
            ([v, icon, label]) =>
              `<button data-action="nav" data-view="${v}" ${model.view === v ? 'aria-current="page"' : ''}><span>${icon}</span>${label}</button>`
          )
          .join('')}</nav>`
      : ''
  }</div></div>`;
}

export function home(model) {
  if (model.boot.motivation) return shiftHome(model);
  const { boot: b, run } = model;
  const p = b.profile;
  const active = run && run.phase !== 'result' ? run : b.activeRun;
  const next = b.catalog.find((s) => !p.completed.includes(s.id)) || b.catalog[0];
  return `<div class="reading-column">${heading('Тренировка', 'Ваша следующая ситуация')}<section class="next-session"><h2>${esc(active ? 'Продолжить начатое' : next.title)}</h2><p>${esc(active ? 'Действия сохранены. Критический таймер не останавливается вне сцены.' : next.summary)}</p>${active ? button('Продолжить попытку', 'resume', `data-id="${esc(active.id)}"`) : button('Начать тренировку', 'brief', `data-id="${esc(next.id)}"`)}<p class="session-progress">Освоено ${p.completed.length} из ${b.catalog.length} ситуаций</p></section><details class="panel catalog-disclosure" data-disclosure="catalog"><summary>Выбрать другую ситуацию</summary><div class="scenario-grid">${b.catalog.map((s) => `<article class="scenario-card"><h3>${esc(s.title)}</h3><p>${esc(s.summary)}</p><p>${esc(s.duration)}${p.completed.includes(s.id) ? ' · Освоено' : ''}</p>${button('Открыть ситуацию', 'brief', `data-id="${esc(s.id)}"`, 'outline-button')}</article>`).join('')}</div></details><details class="panel" data-disclosure="week"><summary>Цель недели</summary><h2>${esc(b.challenge.title)}</h2><p>${b.challenge.progress} из ${b.challenge.target} · ${b.challenge.completed ? 'Выполнено' : 'В процессе'}</p><p>Награда: ${b.challenge.reward} сезонных бонусов. До ${new Date(b.challenge.endsAt).toLocaleDateString('ru-RU')}.</p></details><a class="prototype-entry" href="/preview.html"><strong>Новая смена</strong><span>Обзор вагона и несколько дел. Демо без зачёта.</span><span aria-hidden="true">→</span></a></div>`;
}

export function briefing(model) {
  const s = model.boot.catalog.find((x) => x.id === model.brief);
  if (!s)
    return `${heading('Ситуация недоступна', 'Каталог изменился')}${button('Вернуться к смене', 'nav', 'data-view="home"')}`;
  return `<div class="reading-column">${button('← К смене', 'nav', 'data-view="home"', 'text-back')}${heading('Перед началом', s.title, s.summary)}<p class="timing-note">В срочных сценах есть таймер. Уход со страницы его не останавливает; чтение последствий — без спешки.</p><div class="stack">${button('Начать зачётную попытку', 'start', `data-id="${esc(s.id)}"`)}${button('Практика без рейтинга', 'start', `data-id="${esc(s.id)}" data-practice="true"`, 'outline-button')}</div><details class="panel" data-disclosure="rules"><summary>Как устроена тренировка</summary><p>Читайте ситуацию, выбирайте действие и разбирайте последствия. ${esc(s.duration)} · версия ${esc(s.version)}.</p><p>Практика тоже использует таймер. Зачёт: безопасность не ниже 65, лояльность не ниже 55, без критической ошибки. Рейтинг учитывает лучший зачёт модуля, а не сумму повторов.</p>${note}</details></div>`;
}

export function decision(model) {
  const r = model.run;
  return `<div class="reading-column">${button('← К смене', 'nav', 'data-view="home"', 'text-back')}${heading('Вагон ' + r.scenario.carriage + ' · ' + (r.practice ? 'Практика' : 'Учебный зачёт'), r.scenario.title)}${scales(r.loyalty, r.safety)}<section class="scene-card"><p class="speaker">${esc(r.node.speaker)}</p><p class="scene-context">${esc(r.node.label)}</p><blockquote>${esc(r.node.text)}</blockquote></section>${r.deadline !== null ? `<section class="timer-block" aria-label="Критическое окно"><div class="timer-label"><strong>Время на решение</strong><span role="timer" aria-live="off"><strong id="timer-number">${r.node.timer}</strong> с</span></div><div class="timer-meter" aria-hidden="true"><span id="timer-meter"></span></div><span id="timer-announcement" class="sr-only" aria-live="polite"></span></section>` : ''}<h2 id="decision-prompt">${esc(r.node.prompt)}</h2><div class="options" role="group" aria-labelledby="decision-prompt">${r.node.options.map((o, i) => `<button class="option" data-action="choose" data-id="${esc(o.id)}" ${o.available ? '' : 'aria-disabled="true"'}><span class="option-index" aria-hidden="true">${i + 1}</span><span class="option-copy"><strong>${esc(o.title)}</strong>${(o.available ? o.description : o.requirement) ? `<small>${esc(o.available ? o.description : 'Недоступно: ' + o.requirement)}</small>` : ''}</span></button>`).join('')}</div>${r.criticalError ? '<p class="critical-notice">Критическая ошибка записана. Зачёт невозможен, но можно продолжить для разбора.</p>' : ''}<details class="panel" data-disclosure="resources"><summary>Ресурсы и состояние</summary><p>Коллега ${r.resources.colleague ? 'свободен' : 'задействован'}. Экстренная связь не ограничена.</p><p>Очки попытки: ${r.points}. Очки не заменяют безопасность.</p>${button('Прервать попытку', 'abort', '', 'text-back danger-text')}</details></div>`;
}

export function feedback(r) {
  const h = r.history.at(-1);
  const diff = (n) => (n > 0 ? '+' : '') + n;
  return `<div class="reading-column">${heading('Последствие', h.timedOut ? 'Время вышло' : 'Что изменилось')}<section class="scene-card feedback-card"><p class="lead">${esc(h.feedback)}</p>${h.critical ? '<p class="critical-notice">Критическая ошибка. Учебный зачёт за эту попытку невозможен.</p>' : ''}</section>${button(r.finished ? 'Открыть полный разбор' : 'Продолжить', 'continue')}<p class="timing-note">Следующий таймер ещё не идёт.</p>${scales(r.loyalty, r.safety)}<details class="panel" data-disclosure="feedback"><summary>Ваше действие и оценка</summary><h2>${esc(h.title)}</h2><p>Лояльность: ${diff(h.impact.loyalty)}. Безопасность: ${diff(h.impact.safety)}. Очки: ${diff(h.impact.points)}.</p></details></div>`;
}
