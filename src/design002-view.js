import { wagonMap } from './wagon-view.js';
import { esc } from './ui.js';
import { courseLessons, lessonPassed } from './course.js';
const nav = (text, view = 'home') =>
  `<button class="outline-button" data-action="nav" data-view="${view}">${text}</button>`;
const delta = (n) => (n > 0 ? '+' : '') + n;
const num = (n) => Number(n || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
const actionButton = (run, a, label = a.label) =>
  `<button class="d2-action" data-shift-action="${run.actions.indexOf(a)}" ${a.available === false ? 'disabled' : ''}><span>${esc(label)}${a.unavailableReason ? `<small>${esc(a.unavailableReason)}</small>` : ''}</span></button>`;
const buttons = (r, type) =>
  r.actions
    .filter((a) => a.command === type)
    .map((a) => actionButton(r, a))
    .join('');
const loc = (r, p) =>
  `Вагон ${r.context.carriage}${p?.seat ? ' · место ' + p.seat : ''}${p?.zone === 'aisle' ? ' · проход' : p?.zone === 'vestibule' ? ' · тамбур' : ''}`;
function reactionView(r, compact = false) {
  const meaningful = [
    'action',
    'task_completed',
    'dialogue',
    'inspection',
    'critical_timeout',
    'task_failed',
    'automatic',
  ];
  const last = [...r.log].reverse().find((e) => meaningful.includes(e.type));
  if (!last) return '';
  const batch = r.log.filter((e) => e.revisionAfter === last.revisionAfter);
  const primary =
    batch.find((e) =>
      ['action', 'task_completed', 'dialogue', 'inspection', 'critical_timeout'].includes(e.type)
    ) || last;
  const effects = batch.filter(
    (e) =>
      e !== primary &&
      ['task_created', 'task_failed', 'automatic', 'critical_timeout', 'appeared'].includes(e.type)
  );
  const impact = primary.impact;
  const changes = [];
  if (impact?.passengers?.length === 1)
    changes.push(
      `Лояльность пассажира ${delta(impact.passengers[0].after - impact.passengers[0].before)}`
    );
  else if (impact?.passengers?.length)
    changes.push(`Изменилась лояльность ${impact.passengers.length} пассажиров`);
  if (impact?.safety) changes.push(`Безопасность ${delta(impact.safety)}`);
  return `<section class="d2-reaction" aria-label="Результат действия"><small>${primary.type === 'dialogue' ? 'Ответ собеседника' : primary.type === 'critical_timeout' ? 'Время на решение истекло' : 'Результат действия'}</small>${compact && primary.type === 'dialogue' ? '' : `<h2>${esc(primary.title)}</h2>`}<p>${esc(primary.text)}</p>${changes.length ? `<p class="d2-reaction-impact">${esc(changes.join(' · '))}</p>` : ''}${!compact && effects.length ? `<ul class="d2-reaction-effects">${effects.map((e) => `<li><b>${e.type === 'task_created' ? 'Новая задача: ' : e.type === 'appeared' ? 'Новое обращение: ' : e.type === 'task_failed' ? 'Задача закрыта: ' : ''}${esc(e.title)}</b>${!['task_created', 'appeared'].includes(e.type) ? `<p>${esc(e.text)}</p>` : ''}</li>`).join('')}</ul>` : ''}</section>`;
}
function workList(r) {
  const problems = r.incidents.filter((i) => i.status === 'open');
  const tasks = r.tasks.filter((t) => t.status === 'open');
  const card = (item, kind) => {
    const a = r.actions.find((a) =>
      kind === 'problem'
        ? a.command === 'focus' && a.incidentId === item.id
        : a.command === 'task' && a.taskId === item.id
    );
    const blocked = !a || a.available === false;
    const reason = a?.unavailableReason || 'Сначала завершите текущую карточку';
    return `<button class="d2-case d2-work-${kind}" ${kind === 'task' ? `data-work-card="${esc(item.id)}"` : a ? `data-shift-action="${r.actions.indexOf(a)}"` : ''} ${blocked ? 'disabled' : ''}><span class="d2-case-dot" aria-hidden="true">${kind === 'task' ? '▤' : '●'}</span><span><small>${loc(r, item)}</small><strong>${esc(item.label)}</strong><span>${esc(item.text)}</span>${blocked ? `<small>${esc(reason)}</small>` : ''}</span><span aria-hidden="true">→</span></button>`;
  };
  const inspection = r.actions.find((a) => a.command === 'inspect');
  return `<div class="d2-case-list" aria-label="Все текущие проблемы и задачи"><section class="d2-work-group"><h2>Проблемы <small>${problems.length}</small></h2>${problems.map((i) => card(i, 'problem')).join('') || '<p class="d2-caption">Известных открытых проблем пока нет.</p>'}</section><section class="d2-work-group"><h2>Задачи <small>${tasks.length + (inspection ? 1 : 0)}</small></h2>${tasks.map((t) => card(t, 'task')).join('')}${inspection ? '<button class="d2-case d2-work-task" data-work-card="inspect"><span class="d2-case-dot" aria-hidden="true">▤</span><span><small>Весь вагон</small><strong>Осмотреть вагон</strong><span>Проверить салон, проход и тамбур: есть ли незамеченные проблемы.</span></span><span aria-hidden="true">→</span></button>' : ''}</section></div>`;
}
function workCard(r, id) {
  const task = r.tasks.find((t) => t.id === id && t.status === 'open');
  const inspection = id === 'inspect';
  const a = r.actions.find((a) =>
    inspection ? a.command === 'inspect' : a.command === 'task' && a.taskId === id
  );
  if (!a || (!task && !inspection)) return '';
  return `<p class="eyebrow">Задача · ${loc(r, task)}</p><h1 tabindex="-1">${inspection ? 'Осмотреть вагон' : esc(task.label)}</h1><p class="d2-lead">${inspection ? 'Пройдите по салону, проверьте проходы и тамбур. Найденные проблемы появятся в этой карточке: одной можно заняться сразу.' : esc(task.text)}</p><div class="d2-choices shift-actions">${actionButton(r, a, inspection ? 'Осмотреть салон, проход и тамбур' : 'Выполнить задачу')}</div>`;
}
function acknowledgementCard(r) {
  const x = r.acknowledgement;
  const changes = [];
  if (x.impact?.safety) changes.push(`Безопасность ${delta(x.impact.safety)}`);
  if (x.impact?.passengers?.length === 1)
    changes.push(
      `Лояльность пассажира ${delta(x.impact.passengers[0].after - x.impact.passengers[0].before)}`
    );
  const related = (x.events || []).filter(
    (e) => e.type === 'task_created' && (!x.eventId || e.causeEventId === x.eventId)
  );
  return `<p class="eyebrow">${loc(r, x)}</p><h1 tabindex="-1">${esc(x.title)}</h1><section class="d2-card-outcome" aria-label="Результат действия"><h2>${x.type === 'critical_timeout' ? 'Время на решение истекло' : 'Результат'}</h2><p class="d2-lead">${esc(x.text)}</p>${changes.length ? `<p>${esc(changes.join(' · '))}</p>` : ''}${related.length ? `<h3>Дальнейшие задачи</h3><ul>${related.map((e) => `<li>${esc(e.title)}</li>`).join('')}</ul>` : ''}</section><div class="d2-choices shift-actions">${
    x.local
      ? '<button class="d2-action" data-local-ack>Окей</button>'
      : r.actions
          .filter((a) => a.command === 'continue')
          .map((a) => actionButton(r, a, 'Окей'))
          .join('')
  }</div>`;
}
function inspectionCard(r) {
  const found = r.incidents.filter(
    (i) => r.pendingInspection.includes(i.id) && i.status === 'open'
  );
  return `<p class="eyebrow">Задача · ${loc(r)}</p><h1 tabindex="-1">Осмотр вагона</h1><p class="d2-lead">Найдено проблем: ${found.length}. Одной можно заняться сразу в рамках этого осмотра.</p><div class="d2-choices">${found
    .map((i) => {
      const a = r.actions.find((a) => a.command === 'focus' && a.incidentId === i.id);
      return a ? actionButton(r, a, `${i.label} · ${loc(r, i)}`) : '';
    })
    .join('')}${buttons(r, 'continue')}</div>`;
}
function mapPreview(r, id, locked) {
  const p = r.incidents.find((p) => p.id === id && p.status === 'open');
  if (!p)
    return '<p class="d2-caption">Нажмите отметку, чтобы увидеть название проблемы перед переходом.</p>';
  const a = r.actions.find((a) => a.command === 'focus' && a.incidentId === p.id);
  return `<section class="d2-map-preview" aria-label="Проблема на схеме"><small>${loc(r, p)}</small><h2>${esc(p.label)}</h2><p>${esc(p.text)}</p>${r.focusIncidentId === p.id ? '<button class="d2-action" data-game-tab="scene">Вернуться к открытой карточке</button>' : !locked && a ? actionButton(r, a, 'Открыть проблему') : '<p class="d2-caption">Сначала завершите открытую карточку.</p>'}</section>`;
}
function logView(r) {
  const entries = r.phase === 'briefing' ? [] : r.log;
  if (!entries.length)
    return `<p class="d2-empty-log">${r.phase === 'briefing' ? 'Смена ещё не началась. Здесь появятся события после её начала.' : 'Событий пока нет.'}</p>`;
  const labels = {
    begin: 'Начало',
    appeared: 'Новое обращение',
    discovered: 'Обнаружено при осмотре',
    interaction: 'Открыто обращение',
    dialogue: 'Диалог',
    action: 'Ваше решение',
    automatic: 'Автоматический исход',
    critical_timeout: 'Время истекло',
    task_created: 'Новая задача',
    task_completed: 'Задача выполнена',
    task_failed: 'Задача не выполнена',
    inspection: 'Осмотр',
    prevented: 'Профилактика',
    finished: 'Итог',
  };
  return `<ol class="d2-log">${[...entries]
    .reverse()
    .map((e) => {
      const cause = e.causeEventId && entries.find((prior) => prior.eventId === e.causeEventId);
      const place = [
        e.zone === 'aisle' ? 'Проход' : e.zone === 'vestibule' ? 'Тамбур' : '',
        e.seat ? 'место ' + e.seat : '',
      ]
        .filter(Boolean)
        .join(' · ');
      return `<li><details class="d2-log-entry"><summary><span>${esc(e.title)}</span><small>${labels[e.type] || 'Событие'} · ${e.turn === 0 ? 'Начало' : 'Ход ' + e.turn}</small></summary><small>${e.turn === 0 ? 'Начало смены' : 'Ход ' + e.turn}${place ? ' · ' + esc(place) : ''}</small><span class="d2-log-kind">${e.type === 'task_failed' && e.reason === 'deadline' ? 'Время задачи упущено' : labels[e.type] || 'Событие'}</span><h3>${esc(e.title)}</h3>${e.wasHidden ? '<small>Проблема оставалась незамеченной</small>' : ''}${e.choice ? `<p class="d2-log-choice"><b>Вы:</b> ${esc(e.choice)}</p>` : ''}<p>${esc(e.text)}</p>${e.impact ? `<small>${e.impact.passengers?.length ? 'Лояльность: ' + e.impact.passengers.map((p) => 'место ' + p.seat + ' ' + delta(p.after - p.before)).join(', ') : ''}${e.impact.safety ? ' · Безопасность ' + delta(e.impact.safety) : ''}</small>` : ''}${cause ? `<small>Причина: ${esc(cause.choice || cause.title)}</small>` : ''}</details></li>`;
    })
    .join('')}</ol>`;
}
function results(r) {
  const x = r.result;
  const review = (problems) =>
    problems
      .map(
        (p) =>
          `<article class="d2-review"><header><h3>${esc(p.title)}</h3><b>${p.points}/2</b></header>${criticalIds.has(p.id) ? '<p class="d2-critical-error">Критическая ошибка</p>' : ''}<small>Место ${p.seat} · ${p.resolution === 'choice' ? 'Ваше решение' : p.resolution === 'timeout' ? 'Истёк таймер' : !p.discovered ? 'Осталось незамеченным' : 'Автоматический исход'}</small>${p.choice ? `<p>Вы: ${esc(p.choice)}</p>` : ''}<p>${esc(p.text)}</p>${p.points < 2 ? `<p class="d2-alternative">Другой подход: ${esc(p.alternative)}</p>` : ''}</article>`
      )
      .join('');
  const criticalIds = new Set((x.criticalErrors || []).map((e) => e.problemId));
  const missed = x.problems.filter((p) => p.points < 2),
    good = x.problems.filter((p) => p.points === 2);
  const group = (label, count, content) =>
    `<details class="d2-result-group"><summary><span>${label}</span><b>${count}</b></summary>${content}</details>`;
  return `<section class="d2-results"><p class="eyebrow">${r.step} из ${r.totalTurns} ходов</p><h1 tabindex="-1">${esc(x.title)}</h1><div class="d2-score"><strong>${num(x.shiftScore)}</strong><span>+${num(x.competencyGain)} очков компетенций<br>Сохранено автоматически</span></div><p class="d2-score-basis">Баллы за проблемы: <b>${num(x.fact)} / ${num(x.max)}</b></p>${x.reasons.map((t) => `<p class="d2-notice">${esc(t)}</p>`).join('')}<div class="d2-result-summary"><span>Лояльность <b>${num(x.scales.loyalty)}</b></span><span>Безопасность <b>${num(x.scales.safety)}</b></span></div><p class="d2-result-counts">Решено обращений: <b>${x.stats.resolved}</b> · Пропущено: <b>${x.stats.automatic}</b><br>Задачи: <b>${x.stats.tasksDone}</b> выполнено, <b>${x.stats.tasksMissed}</b> не выполнено</p><div class="d2-result-nav">${nav('К курсу')}${nav('Мой прогресс', 'profile')}</div><div class="d2-result-details">${group('Ошибки и пропуски', missed.length, `<p>Остались незамеченными: ${x.stats.undiscovered}. Критических ошибок: ${x.stats.criticalFailed ?? criticalIds.size}.</p>` + (missed.length ? review(missed) : '<p>Все проблемы получили лучший исход.</p>'))}${group('Удачные решения', good.length, good.length ? review(good) : '<p>В этой смене нет решений с максимальной оценкой.</p>')}${group('Рабочие задачи', x.tasks.length, x.tasks.map((t) => `<article class="d2-review"><h3>${t.status === 'completed' ? '✓' : '○'} ${esc(t.label)}</h3><p>${esc(t.text)}</p></article>`).join(''))}${group('Лог событий', r.log.length, logView(r))}</div></section>`;
}
export function designShift(r, ui = {}) {
  if (!r.acknowledgement && ui.legacyAcknowledgement)
    r = { ...r, acknowledgement: { ...ui.legacyAcknowledgement, local: true } };
  if (r.phase === 'result' && !r.acknowledgement) return results(r);
  const locked = !!(r.acknowledgement || r.phase === 'scene' || r.pendingInspection || ui.workCard);
  const passenger = r.scene && r.passengers.find((p) => p.seat === r.scene.seat);
  const passengerMeter = passenger
    ? `<div class="d2-passenger-meter"><span>Лояльность пассажира · место ${passenger.seat} <b>${num(passenger.loyalty)}</b></span><progress max="100" value="${passenger.loyalty}" aria-label="Лояльность пассажира на месте ${passenger.seat}"></progress></div>`
    : '';
  const legacyTiming =
    r.timingPolicy.durationMs === null
      ? '<p class="d2-caption">Сохранённая смена прежней версии: без реального таймера. Новые смены используют таймер срочных ситуаций.</p>'
      : '';
  let scene = '';
  if (r.acknowledgement) scene = acknowledgementCard(r);
  else if (ui.workCard && r.phase === 'overview' && !r.pendingInspection)
    scene = workCard(r, ui.workCard);
  else if (r.phase === 'briefing')
    scene = `<p class="eyebrow">${esc(r.context.serviceClassLabel)} · вагон ${r.context.carriage}</p><h1 tabindex="-1">Ваша смена</h1>${legacyTiming}<p class="d2-lead">На смену — ${r.totalTurns} рабочих ходов. Дел будет больше, чем можно успеть: выбирайте, кому и чему уделить внимание.</p><ul class="d2-rules"><li>Одна задача или завершённый этап проблемы — один ход.</li><li>Осмотр открывает скрытые проблемы. Одну найденную можно решить в тот же ход.</li><li>В некоторых ситуациях после входа запускается реальный таймер.</li><li>Решения и пропущенные дела меняют лояльность и безопасность.</li></ul><div class="d2-primary-actions">${buttons(r, 'begin')}</div>`;
  else if (r.phase === 'scene')
    scene = `<div class="d2-scene-text scene-content"><p class="eyebrow">${loc(r, r.scene)}</p><h1 tabindex="-1">${esc(r.scene.title)}</h1><p class="d2-speaker">${esc(r.scene.speaker)}</p>${passengerMeter}${[...r.log].reverse().find((e) => e.type === 'dialogue')?.revisionAfter === r.revision ? reactionView(r, true) : ''}<p class="d2-lead">${esc(r.scene.text)}</p>${r.pendingInspection ? '<p class="d2-caption">Решение входит в ход текущего осмотра.</p>' : ''}</div><div class="d2-choices shift-actions">${buttons(r, 'choose')}</div>`;
  else if (r.pendingInspection) scene = inspectionCard(r);
  else scene = `<p class="eyebrow">${loc(r)}</p><h1 tabindex="-1">Дела в вагоне</h1>${workList(r)}`;
  return `<div class="shift-console d2-console" data-phase="${r.phase}"><section class="d2-pane ${r.phase === 'scene' ? 'd2-dialogue' : ''}" data-game-pane="scene">${scene}</section><section class="d2-pane" data-game-pane="map" hidden><h1>Вагон</h1>${mapPreview(r, ui.mapIncident, locked)}${wagonMap(r)}</section><section class="d2-pane" data-game-pane="log" hidden><h1>Лог этой смены</h1><p class="d2-caption">Новые события сверху. Откройте запись, чтобы прочитать подробности.</p>${logView(r)}</section><section class="d2-pane" data-game-pane="tools" hidden><h1>Моя смена</h1>${legacyTiming}<p>${esc(r.context.serviceClassLabel)} · ${r.step} из ${r.totalTurns} ходов использовано</p>${nav('На главную')}<p>Можно вернуться в эту смену.${r.timingPolicy.durationMs !== null ? ' Таймер начатой срочной ситуации продолжает идти при выходе.' : ''}</p>${r.actions.some((a) => a.command === 'abort') ? `<details class="d2-exit"><summary>Прервать смену</summary><p>Все оставшиеся дела получат свои последствия. Незавершённая практика не добавит очков компетенций.</p>${buttons(r, 'abort')}</details>` : ''}</section><nav class="d2-tabs" aria-label="Экраны смены">${[
    ['scene', '◉', locked ? 'Карточка' : 'Дела'],
    ['map', '▦', 'Вагон'],
    ['log', '≡', 'Лог'],
    ['tools', '☰', 'Меню'],
  ]
    .map(
      ([id, icon, label]) =>
        `<button data-game-tab="${id}" ${id === 'log' ? 'aria-label="Лог событий"' : ''} ${id === 'scene' ? 'aria-current="page"' : ''}><span aria-hidden="true">${icon}</span><small>${label}</small></button>`
    )
    .join('')}</nav></div>`;
}
export function designHud(r) {
  const meter = (key, label) =>
    `<div class="compact-meter ${key}" aria-label="${label}: ${r.scales[key]}"><span>${label} <b>${num(r.scales[key])}</b></span><progress max="100" value="${r.scales[key]}"></progress></div>`;
  const w = r.criticalWindow;
  return `<div class="game-clock d2-clock"><small>Ходы смены</small><strong>${r.step} / ${r.totalTurns}</strong><progress max="${r.totalTurns}" value="${r.step}" aria-label="Ходы смены"></progress></div><div class="compact-meters">${meter('loyalty', 'Лояльность')}${meter('safety', 'Безопасность')}</div>${w?.status === 'open' ? (w.deadline === null ? '<span class="d2-legacy-clock">Сохранённая смена<br>без таймера</span>' : `<div class="urgent-clock"><span id="shift-seconds">${Math.ceil(Math.max(0, w.deadline - r.serverNow) / 1000)}</span> с<span id="shift-time-message" class="sr-only" aria-live="polite"></span></div>`) : ''}`;
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
  return `<div class="reading-column d2-home"><div class="d2-home-head"><div><p class="eyebrow">Курс проводника</p><h1 tabindex="-1">Моя смена</h1></div><button class="d2-profile-link" data-action="nav" data-view="profile"><b>${num(p.points)} очк.</b><small>Уровень ${p.level}</small></button></div><section class="d2-next"><small>${active ? 'Смена в работе' : 'Следующая смена · ' + next.number}</small><h2>${active ? 'Вернуться в вагон' : esc(next.title)}</h2><p>${active ? 'Ваши действия сохранены.' : `${esc(next.classLabel)} · ${next.turns} ходов · новые события при каждом прохождении`}</p>${active ? `<button class="primary-button" data-action="resume" data-id="${active.id}">Продолжить смену</button>` : start(next, 'Начать смену')}</section><div class="home-switch" role="group" aria-label="Режим практики"><button data-home-tab="course" aria-pressed="true">Курс</button><button data-home-tab="custom" aria-pressed="false">Своя тренировка</button></div><section data-home-pane="course"><div class="d2-course-title"><h2>План курса</h2><span>${count}/${lessons.length}</span></div><progress class="course-progress" max="${lessons.length}" value="${count}" aria-label="Прогресс курса"></progress><ol class="d2-course">${lessons.map((l) => `<li ${l.id === next.id ? 'class="d2-current"' : ''}><span class="d2-number">${lessonPassed(l, history) ? '✓' : l.number}</span><div><h3>${esc(l.title)}</h3><small>${esc(l.classLabel)} · ${l.turns} ходов${l.id === next.id ? ' · Вы здесь' : ''}</small></div>${!active ? start(l, lessonPassed(l, history) ? 'Повторить' : 'Начать') : ''}</li>`).join('')}</ol></section><section data-home-pane="custom" hidden><h2>Своя тренировка</h2>${
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
