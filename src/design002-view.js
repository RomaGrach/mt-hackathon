import { esc } from './ui.js';
import { courseLessons, lessonPassed } from './course.js';
const nav = (text, view = 'home') =>
  `<button class="outline-button" data-action="nav" data-view="${view}">${text}</button>`;
const delta = (n) => (n > 0 ? '+' : '') + n;
const num = (n) => Number(n || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
const actionButton = (run, a, label = a.label) =>
  `<button class="d2-action" data-shift-action="${run.actions.indexOf(a)}" ${a.available === false ? 'disabled' : ''}><span>${esc(label)}${a.unavailableReason ? `<small>${esc(a.unavailableReason)}</small>` : ''}</span>${a.cost ? '<small class="d2-cost">1 ход</small>' : ''}</button>`;
const buttons = (r, type) =>
  r.actions
    .filter((a) => a.command === type)
    .map((a) => actionButton(r, a))
    .join('');
const loc = (r, p) =>
  `Вагон ${r.context.carriage}${p?.seat ? ' · место ' + p.seat : ''}${p?.zone === 'aisle' ? ' · проход' : p?.zone === 'vestibule' ? ' · тамбур' : ''}`;
function logView(r) {
  return `<ol class="d2-log">${[...r.log]
    .reverse()
    .map(
      (e) =>
        `<li><small>Ход ${e.turn} ${e.seat ? '· место ' + e.seat : ''}</small><h3>${esc(e.title)}</h3><p>${esc(e.text)}</p>${e.impact ? `<small>${e.impact.passengers?.length ? 'Лояльность: ' + e.impact.passengers.map((p) => `место ${p.seat} ${delta(p.after - p.before)}`).join(', ') : ''}${e.impact.safety ? ' · Безопасность ' + delta(e.impact.safety) : ''}</small>` : ''}${e.causeEventId ? `<small>После: ${esc(r.log.find((prior) => prior.eventId === e.causeEventId)?.title || 'предыдущего решения')}</small>` : ''}</li>`
    )
    .join('')}</ol>`;
}
function mapView(r) {
  const sides = r.context.sides,
    per = sides[0] + sides[1];
  const known = r.incidents.filter((i) => i.status === 'open');
  const seat = (n) => {
    const cases = known.filter((i) => i.seat === n),
      p = r.passengers.find((p) => p.seat === n);
    const focus = r.actions.find((a) => a.command === 'focus' && a.incidentId === cases[0]?.id);
    return `<button class="d2-seat ${cases.length ? 'd2-marked' : ''} ${p ? '' : 'd2-empty'}" ${focus ? `data-shift-action="${r.actions.indexOf(focus)}"` : 'disabled'} aria-label="Место ${n}${cases.length ? ': ' + esc(cases.map((i) => i.label).join(', ')) : p ? ', пассажир' : ', свободно'}">${n}${cases.length ? '<span aria-hidden="true">●</span>' : ''}</button>`;
  };
  return `<p class="d2-caption">${esc(r.context.serviceClassLabel)} · ${sides.join(' + ')} · ${r.context.seats} учебных мест</p><div class="d2-carriage"><div class="d2-vestibule">Тамбур · служебная зона</div>${Array.from({ length: r.context.rows }, (_, row) => `<div class="d2-seat-row" style="--d2-cols:${per + 1}">${Array.from({ length: sides[0] }, (_, col) => seat(row * per + col + 1)).join('')}<span class="d2-aisle">${row + 1}</span>${Array.from({ length: sides[1] }, (_, col) => seat(row * per + sides[0] + col + 1)).join('')}</div>`).join('')}<div class="d2-vestibule">Санитарная зона · тамбур</div></div><p class="d2-caption">● Известное обращение. Цвет не указывает срочность.<br>Учебная схема с условными номерами, не утверждённый план ВСМ.</p>${known
    .map((i) => {
      const a = r.actions.find((a) => a.command === 'focus' && a.incidentId === i.id);
      return a ? actionButton(r, a, `Место ${i.seat} · ${i.label}`) : '';
    })
    .join('')}`;
}
function results(r) {
  const x = r.result;
  return `<section class="d2-results"><p class="eyebrow">Итог смены · ${r.step} / ${r.totalTurns} ходов</p><h1 tabindex="-1">${esc(x.title)}</h1><div class="d2-score"><strong>${num(x.shiftScore)}<small> / 100</small></strong><span>+${num(x.competencyGain)} очков компетенций<br>Сохранено автоматически</span></div><p>${x.fact} из ${x.max} баллов за проблемы. Рабочие задачи баллов не дают.</p>${x.reasons.map((t) => `<p class="d2-notice">${esc(t)}</p>`).join('')}<div class="d2-result-summary"><span>Лояльность <b>${num(x.scales.loyalty)}</b></span><span>Безопасность <b>${num(x.scales.safety)}</b></span><span>Решено <b>${x.stats.resolved}</b></span><span>Автоисходов <b>${x.stats.automatic}</b></span><span>Не обнаружено <b>${x.stats.undiscovered}</b></span><span>Задач выполнено <b>${x.stats.tasksDone}</b></span></div><div class="d2-result-nav">${nav('К курсу')}${nav('Мой прогресс', 'profile')}</div><h2>Решения и последствия</h2>${x.problems.map((p) => `<article class="d2-review"><header><h3>${esc(p.title)}</h3><b>${p.points}/2</b></header><small>Место ${p.seat} · ${p.resolution === 'choice' ? 'Ваше решение' : p.resolution === 'timeout' ? 'Истёк таймер' : !p.discovered ? 'Осталось незамеченным' : 'Автоматический исход'}</small>${p.choice ? `<p>Вы: ${esc(p.choice)}</p>` : ''}<p>${esc(p.text)}</p>${p.points < 2 ? `<p class="d2-alternative">Другой подход: ${esc(p.alternative)}</p>` : ''}</article>`).join('')}<h2>Рабочие задачи</h2>${x.tasks.map((t) => `<article class="d2-review"><h3>${t.status === 'completed' ? '✓' : '○'} ${esc(t.label)}</h3><p>${esc(t.text)}</p></article>`).join('')}<h2>История смены</h2>${logView(r)}</section>`;
}
export function designShift(r) {
  if (r.phase === 'result') return results(r);
  const active = r.incidents.filter((i) => i.status === 'open');
  let scene = '';
  if (r.phase === 'briefing')
    scene = `<p class="eyebrow">${esc(r.context.serviceClassLabel)} · вагон ${r.context.carriage}</p><h1 tabindex="-1">Ваша смена</h1><p class="d2-lead">На смену — ${r.totalTurns} рабочих ходов. Дел будет больше, чем можно успеть: выбирайте, кому и чему уделить внимание.</p><ul class="d2-rules"><li>Одна задача или завершённый этап проблемы — один ход.</li><li>Осмотр открывает скрытые проблемы. Одну найденную можно решить в тот же ход.</li><li>В некоторых ситуациях после входа запускается реальный таймер.</li><li>Решения и пропущенные дела меняют лояльность и безопасность.</li></ul><div class="d2-primary-actions">${buttons(r, 'begin')}</div>`;
  else if (r.phase === 'scene')
    scene = `<div class="d2-scene-text scene-content"><p class="eyebrow">${loc(r, r.scene)}</p><h1 tabindex="-1">${esc(r.scene.title)}</h1><p class="d2-speaker">${esc(r.scene.speaker)}</p><p class="d2-lead">${esc(r.scene.text)}</p>${r.pendingInspection ? '<p class="d2-caption">Решение входит в ход текущего осмотра.</p>' : ''}</div><div class="d2-choices shift-actions">${buttons(r, 'choose')}${buttons(r, 'overview')}</div>`;
  else
    scene = `<p class="eyebrow">${loc(r)}</p><h1 tabindex="-1">Дела в вагоне</h1>${r.pendingInspection ? '<p class="d2-notice">Осмотр: выберите одну найденную проблему для решения в этом же ходу или закончите осмотр.</p>' : ''}${
      active.length
        ? `<div class="d2-case-list">${active
            .filter((i) => !r.pendingInspection || r.pendingInspection.includes(i.id))
            .map((i) => {
              const a = r.actions.find((a) => a.command === 'focus' && a.incidentId === i.id);
              return a
                ? `<button class="d2-case" data-shift-action="${r.actions.indexOf(a)}"><span class="d2-case-dot">●</span><span><small>${loc(r, i)}</small><strong>${esc(i.label)}</strong><span>${esc(i.text)}</span></span><span>→</span></button>`
                : '';
            })
            .join('')}</div>`
        : '<p class="d2-lead">Сейчас нет известных обращений. Можно заняться обязанностями или осмотреть вагон.</p>'
    }<div class="d2-primary-actions">${buttons(r, 'inspect')}${buttons(r, 'continue')}<button class="d2-action" data-game-tab="tasks">Рабочие задачи <small>${r.tasks.filter((t) => t.status === 'open').length}</small></button></div>${r.log.length ? `<p class="d2-recent"><b>Последнее:</b> ${esc([...r.log].reverse().find((e) => ['action', 'automatic', 'task_completed', 'critical_timeout', 'inspection'].includes(e.type))?.text || 'Выберите первое рабочее действие.')}</p>` : ''}`;
  const tasks = r.tasks
    .filter((t) => t.status === 'open')
    .map((t) => {
      const a = r.actions.find((a) => a.command === 'task' && a.taskId === t.id);
      return `<article class="d2-task"><small>${t.seat ? 'Место ' + t.seat : 'Вагон'}</small><h2>${esc(t.label)}</h2><p>${esc(t.text)}</p>${a ? actionButton(r, a, 'Выполнить') : '<small>Сначала завершите текущий осмотр.</small>'}</article>`;
    })
    .join('');
  return `<div class="shift-console d2-console" data-phase="${r.phase}"><section class="d2-pane ${r.phase === 'scene' ? 'd2-dialogue' : ''}" data-game-pane="scene">${scene}</section><section class="d2-pane" data-game-pane="map" hidden><h1>Вагон</h1>${mapView(r)}</section><section class="d2-pane" data-game-pane="tasks" hidden><h1>Рабочие задачи</h1>${tasks || '<p>Все текущие задачи выполнены.</p>'}<div class="d2-primary-actions">${buttons(r, 'inspect')}</div></section><section class="d2-pane" data-game-pane="log" hidden><h1>История смены</h1>${logView(r)}</section><section class="d2-pane" data-game-pane="tools" hidden><h1>Моя смена</h1><p>${esc(r.context.serviceClassLabel)} · ${r.step} из ${r.totalTurns} ходов использовано</p>${nav('На главную')}<p>Можно вернуться в эту смену. Реальный таймер продолжает идти при выходе.</p><details class="d2-exit"><summary>Прервать смену</summary><p>Все оставшиеся дела получат свои последствия. Незавершённая практика не добавит очков компетенций.</p>${buttons(r, 'abort')}</details></section><nav class="d2-tabs" aria-label="Экраны смены">${[
    ['scene', '◉', 'Дела'],
    ['map', '▦', 'Вагон'],
    ['tasks', '✓', 'Задачи'],
    ['log', '≡', 'История'],
    ['tools', '☰', 'Меню'],
  ]
    .map(
      ([id, icon, label]) =>
        `<button data-game-tab="${id}" ${id === 'scene' ? 'aria-current="page"' : ''}><span aria-hidden="true">${icon}</span><small>${label}</small></button>`
    )
    .join('')}</nav></div>`;
}
export function designHud(r) {
  const meter = (key, label) =>
    `<div class="compact-meter ${key}" aria-label="${label}: ${r.scales[key]}"><span>${label} <b>${num(r.scales[key])}</b></span><progress max="100" value="${r.scales[key]}"></progress></div>`;
  const w = r.criticalWindow;
  return `<div class="game-clock d2-clock"><small>Смена</small><strong>${r.step} / ${r.totalTurns}</strong><progress max="${r.totalTurns}" value="${r.step}" aria-label="Ходы смены"></progress></div><div class="compact-meters">${meter('loyalty', 'Лояльность')}${meter('safety', 'Безопасность')}</div>${w?.status === 'open' ? `<div class="urgent-clock"><span id="shift-seconds">${w.deadline === null ? '∞' : Math.ceil(Math.max(0, w.deadline - r.serverNow) / 1000)}</span> с<span id="shift-time-message" class="sr-only" aria-live="polite"></span></div>` : ''}`;
}
export function designHome(model) {
  const b = model.boot,
    c = b.shiftCatalog.find((c) => c.engineVersion === 'shift-4'),
    p = b.competency;
  const lessons = courseLessons(c),
    history = p.history,
    active = model.run && model.run.phase !== 'result' ? model.run : b.activeRun;
  const next = lessons.find((l) => !lessonPassed(l, history)) || lessons[0],
    count = lessons.filter((l) => lessonPassed(l, history)).length;
  const start = (l, label) =>
    `<button class="primary-button" data-action="course-start" data-lesson="${l.id}">${label}</button>`;
  const select = (name, label, items) =>
    `<label>${label}<select name="${name}">${items.map(([id, label]) => `<option value="${id}">${esc(label)}</option>`).join('')}</select></label>`;
  return `<div class="reading-column d2-home"><div class="d2-home-head"><div><p class="eyebrow">Курс проводника</p><h1 tabindex="-1">Моя смена</h1></div><button class="d2-profile-link" data-action="nav" data-view="profile"><b>${num(p.points)}</b><small>очков компетенций · ур. ${p.level}</small></button></div><section class="d2-next"><small>${active ? 'Смена в работе' : 'Следующая смена · ' + next.number}</small><h2>${active ? 'Вернуться в вагон' : esc(next.title)}</h2><p>${active ? 'Ваши действия сохранены.' : `${esc(next.classLabel)} · ${next.turns} ходов · новые события при каждом прохождении`}</p>${active ? `<button class="primary-button" data-action="resume" data-id="${active.id}">Продолжить смену</button>` : start(next, 'Начать смену')}</section><div class="home-switch" role="group" aria-label="Режим практики"><button data-home-tab="course" aria-pressed="true">Курс</button><button data-home-tab="custom" aria-pressed="false">Своя тренировка</button></div><section data-home-pane="course"><div class="d2-course-title"><h2>План курса</h2><span>${count}/${lessons.length}</span></div><progress class="course-progress" max="${lessons.length}" value="${count}" aria-label="Прогресс курса"></progress><ol class="d2-course">${lessons.map((l) => `<li ${l.id === next.id ? 'class="d2-current"' : ''}><span class="d2-number">${lessonPassed(l, history) ? '✓' : l.number}</span><div><h3>${esc(l.title)}</h3><small>${esc(l.classLabel)} · ${l.turns} ходов${l.id === next.id ? ' · Вы здесь' : ''}</small></div>${!active ? start(l, lessonPassed(l, history) ? 'Повторить' : 'Начать') : ''}</li>`).join('')}</ol></section><section data-home-pane="custom" hidden><h2>Своя тренировка</h2>${
    active
      ? '<p>Сначала завершите текущую смену.</p>'
      : `<form id="shift-start-form" class="d2-custom">${select(
          'serviceClass',
          'Класс обслуживания',
          c.classes.map((c) => [c.id, c.label])
        )}${select(
          'variantId',
          'Нагрузка смены',
          c.trainingVariants.map((v) => [v.id, `${v.label} · ${v.turns} ходов`])
        )}${select('timingPolicyId', 'Время в срочной ситуации', [
          ['standard', '60 секунд'],
          ['extended', '120 секунд'],
          ['untimed', 'Без ограничения'],
        ])}${select('mode', 'Режим', [
          ['training', 'Обучение'],
          ['assessment', 'Проверка'],
        ])}<button class="primary-button" type="submit">Начать тренировку</button></form>`
  }</section>${!model.tutorialSeen ? '<section class="d2-learn"><h2>Первый рейс?</h2><p>Обучение покажет управление внутри вагона.</p><button class="outline-button" data-action="tutorial-start">Пройти обучение</button></section>' : ''}</div>`;
}
export function designProfile(model) {
  const p = model.boot.competency;
  return `<div class="reading-column d2-profile"><p class="eyebrow">${esc(model.boot.profile.name)}</p><h1 tabindex="-1">Мой прогресс</h1><div class="d2-score"><strong>${num(p.points)}</strong><span>очков компетенций<br>Уровень ${p.level}</span></div><progress max="250" value="${p.levelProgress}" aria-label="До следующего уровня"></progress><p>До уровня ${p.level + 1}: ${num(p.nextLevelAt - p.points)} очков. Итог каждой завершённой смены прибавляется автоматически.</p><h2>История смен</h2>${p.history.length ? p.history.map((r) => `<button class="d2-history" data-action="history" data-id="${r.runId}"><span><strong>${esc(r.title)}</strong><small>${new Date(r.at).toLocaleDateString('ru-RU')} · Лояльность ${num(r.scales.loyalty)} · Безопасность ${num(r.scales.safety)}</small></span><b>+${num(r.gain)}</b></button>`).join('') : '<p>Здесь появятся результаты ваших смен.</p>'}<h2>Над чем поработать</h2>${p.mistakes.length ? p.mistakes.map((m) => `<article class="d2-review"><h3>${esc(m.title)}</h3><p>${esc(m.text)}</p><button class="text-back" data-action="history" data-id="${m.runId}">Открыть разбор →</button></article>`).join('') : '<p>После прохождения здесь будут конкретные ошибки и пропущенные дела.</p>'}<details class="d2-settings"><summary>Настройки и прежние результаты</summary><p>Старые прохождения сохранены отдельно от новой системы очков.</p>${(
    model.boot.motivation?.history || []
  )
    .slice(0, 10)
    .map(
      (r) =>
        `<button class="d2-action" data-action="history" data-id="${r.runId}">Открыть прежнюю смену · ${new Date(r.at).toLocaleDateString('ru-RU')}</button>`
    )
    .join(
      ''
    )}<button class="outline-button" data-action="export">Экспорт моих данных</button><button class="outline-button" data-action="logout">Выйти из профиля</button><button class="text-back" data-action="delete">Удалить профиль</button></details></div>`;
}
export function designLeaders(model) {
  const x = model.competencyLeaders;
  return `<div class="reading-column"><p class="eyebrow">Учебная практика</p><h1 tabindex="-1">Рейтинг компетенций</h1><p>Сумма результатов завершённых смен. Очки не сгорают.</p><div class="home-switch">${[
    ['crew', 'Бригада'],
    ['depot', 'Депо'],
    ['company', 'Компания'],
  ]
    .map(
      ([id, label]) =>
        `<button data-action="scope" data-id="${id}" aria-pressed="${model.scope === id}">${label}</button>`
    )
    .join(
      ''
    )}</div>${x ? `<p>Участников: ${x.total} · ваше место: ${x.myRank}</p>${x.rows.map((r) => `<div class="d2-history ${r.me ? 'd2-current' : ''}"><span>${r.rank}. ${esc(r.name)}${r.me ? ' · Вы' : ''}</span><b>${num(r.score)}</b></div>`).join('')}<div class="d2-result-nav">${x.offset ? `<button data-action="rank-page" data-offset="${Math.max(0, x.offset - x.limit)}">Назад</button>` : ''}${x.offset + x.limit < x.total ? `<button data-action="rank-page" data-offset="${x.offset + x.limit}">Далее</button>` : ''}</div>` : '<p>Загрузка рейтинга…</p>'}</div>`;
}
