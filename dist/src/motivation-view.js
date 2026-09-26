import { esc, button, heading } from './ui.js';
const when = (value) =>
  new Date(value).toLocaleDateString('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: 'numeric',
    month: 'long',
  });
const modes = { training: 'Обучение', assessment: 'Проверка' };
const times = {
  standard: '20 секунд в срочной сцене',
  extended: '200 секунд в срочной сцене',
  untimed: 'Без ограничения времени',
};
const bands = {
  starter: 'Начинающие',
  main: 'Основная группа',
  returning: 'Возвращение к практике',
};
const skills = {
  protocol: 'Проверка и порядок действий',
  empathy: 'Работа с обращением',
  teamwork: 'Командная работа',
  speed: 'Своевременность',
};
const attr = (name, value) => 'data-' + name + '="' + esc(value) + '"';
function select(id, name, label, items, current) {
  return (
    '<label for="' +
    id +
    '">' +
    esc(label) +
    '</label><select id="' +
    id +
    '" name="' +
    name +
    '">' +
    items
      .map(
        (x) =>
          '<option value="' +
          esc(x.id) +
          '" ' +
          (x.id === current ? 'selected' : '') +
          '>' +
          esc(x.label) +
          '</option>'
      )
      .join('') +
    '</select>'
  );
}
function scoreSummary(m) {
  return (
    '<div class="practice-summary"><section class="panel"><h2>Опыт практики</h2><p class="practice-number">' +
    m.lifetimePracticeXP +
    ' <span>XP</span></p><p>Учебный уровень ' +
    m.practiceLevel +
    ' · не показатель квалификации.</p><p>XP и история не сгорают.</p></section><section class="panel"><h2>Текущая неделя</h2><p class="practice-number">' +
    m.participation.seasonPoints +
    ' <span>из 100 СП</span></p><p>Только лучший сопоставимый зачёт. До ' +
    when(m.period.endAt) +
    ', 00:00 по Москве.</p></section></div>'
  );
}
function participation(m) {
  const e = m.participation;
  return (
    '<details class="panel" data-disclosure="competition"><summary>Добровольное соревнование</summary><p>Один сценарий, одинаковый класс и стандартное время. Две попытки; в зачёт идёт лучшая, не сумма повторов.</p>' +
    (e.optIn
      ? '<p>' +
        esc(bands[e.band]) +
        ' · использовано ' +
        e.attemptsUsed +
        ' из 2 попыток.</p>' +
        (e.attemptsRemaining
          ? button('Начать попытку рейтинга', 'competitive-start', '', 'outline-button')
          : '<p>Лимит соревнования исчерпан. Обучение остаётся доступным.</p>') +
        button(
          'Не участвовать в этой неделе',
          'period-entry',
          attr('entry', 'withdraw') + ' ' + attr('period', m.period.id),
          'text-back'
        )
      : button(
          'Участвовать на этой неделе',
          'period-entry',
          attr('entry', 'join') + ' ' + attr('period', m.period.id),
          'outline-button'
        )) +
    '<p class="timing-note">Не менее пяти сопоставимых участников с результатом для показа мест. Пустые места не заполняются ботами.</p></details>'
  );
}
export function shiftHome(model) {
  const b = model.boot,
    m = b.motivation,
    active = model.run && model.run.phase !== 'result' ? model.run : b.activeRun,
    c = b.shiftCatalog?.[0];
  let main;
  if (active)
    main =
      '<section class="next-session"><h2>Продолжить начатую попытку</h2><p>Действия сохранены. Открытый критический таймер продолжает идти вне страницы.</p>' +
      button('Продолжить смену', 'resume', attr('id', active.id)) +
      '</section>';
  else if (c)
    main =
      '<section class="next-session"><h2>' +
      esc(c.title) +
      '</h2><p>Проверьте готовность вагона, работайте с обращениями, замечайте изменения и возвращайтесь к обещанному.</p><form id="shift-start-form"><button class="primary-button" type="submit">Начать смену</button><details class="panel" data-disclosure="shift-options"><summary>Класс, время и режим</summary><div class="settings-stack">' +
      select('shift-class', 'serviceClass', 'Класс обслуживания', c.classes, 'standard') +
      select(
        'shift-time',
        'timingPolicyId',
        'Время в срочной ситуации',
        c.timingPolicies.map((t) => ({ id: t.id, label: times[t.id] })),
        'standard'
      ) +
      select(
        'shift-mode',
        'mode',
        'Режим',
        [
          { id: 'training', label: 'Обучение: объяснения и учебная пауза' },
          { id: 'assessment', label: 'Проверка без участия в рейтинге' },
        ],
        'training'
      ) +
      select(
        'shift-variant',
        'variantId',
        'Учебный вариант',
        c.trainingVariants,
        c.trainingVariants[0].id
      ) +
      '<p class="timing-note">В проверке вариант назначается сервером. Настройки фиксируются на всю попытку. Дополнительные услуги в игре не выдумываются: используются проектные сведения из датасета.</p></div></details></form></section>';
  else
    main =
      '<section class="panel"><h2>Смена временно недоступна</h2><p>Новые попытки отключены оператором. Сохранённые попытки и история не удалены.</p></section>';
  const goal = m.goal.paused
    ? 'Цель на паузе'
    : m.goal.completed
      ? 'Цель выполнена'
      : m.goal.days.length + ' из ' + m.goal.target + ' учебных дней';
  return (
    '<div class="reading-column">' +
    heading('Тренажёр проводника', 'Ваша смена') +
    main +
    '<section class="panel"><h2>Ваш ритм</h2><p>' +
    goal +
    ' за неделю · ' +
    m.lifetimePracticeXP +
    ' XP за полезную практику.</p>' +
    button('Посмотреть навыки и цель', 'nav', 'data-view="profile"', 'text-back') +
    '</section>' +
    (m.nextReview
      ? '<details class="panel" data-disclosure="recommended"><summary>Следующая практика</summary><p>' +
        (m.nextReview.criterionId
          ? 'Вернитесь к критерию из последнего разбора.'
          : 'Можно попробовать другой проверенный вариант.') +
        ' Рекомендация на ' +
        esc(m.nextReview.dueDate) +
        '. ' +
        (m.nextReview.sameContext
          ? 'Повторяется тот же контекст для проверки конкретной ошибки.'
          : 'Доступен другой проверенный контекст.') +
        '</p>' +
        button(
          'Открыть рекомендованную тренировку',
          'review-start',
          attr('variant', m.nextReview.variantId),
          'outline-button'
        ) +
        '</details>'
      : '') +
    (!active && c ? participation(m) : '') +
    '<details class="panel catalog-disclosure" data-disclosure="catalog"><summary>Отдельные учебные сценарии v1</summary><p>Предыдущие модули сохранены. Их старые баллы не смешиваются с XP и недельными СП новой смены.</p><div class="scenario-grid">' +
    b.catalog
      .map(
        (s) =>
          '<article class="scenario-card"><h3>' +
          esc(s.title) +
          '</h3><p>' +
          esc(s.summary) +
          '</p>' +
          button('Открыть ситуацию', 'brief', attr('id', s.id), 'outline-button') +
          '</article>'
      )
      .join('') +
    '</div></details></div>'
  );
}
function evidenceGroup(group) {
  return (
    '<section class="panel"><h3>' +
    esc(modes[group.mode]) +
    ' · ' +
    esc(times[group.timingPolicy.id]) +
    '</h3><p class="timing-note">' +
    esc(group.variantId) +
    ' · ' +
    esc(group.servicePolicyId) +
    ' · последнее прохождение этих условий.</p><div class="criterion-list">' +
    group.criteria
      .map(
        (c) =>
          '<div class="criterion-row"><div><strong>' +
          esc(c.label) +
          '</strong><small>' +
          esc(skills[c.competency]) +
          '</small></div><span>' +
          (c.status === 'not_assessed' ? 'Не оценивалось' : c.earned + ' / ' + c.possible) +
          '</span></div>'
      )
      .join('') +
    '</div></section>'
  );
}
export function motivationProfile(model) {
  const m = model.boot.motivation;
  const recent = m.evidence[0];
  return (
    '<div class="reading-column">' +
    heading('Навыки и профиль', 'Ваша практика', model.boot.profile.name) +
    scoreSummary(m) +
    '<section class="panel"><h2>Личная цель</h2><p>' +
    (m.goal.paused
      ? 'Пауза — без потери накопленного прогресса.'
      : m.goal.days.length + ' из ' + m.goal.target + ' разных учебных дней на этой неделе.') +
    '</p><p>Выполнено недель: ' +
    m.successfulWeeks +
    '. Это не непрерывная серия: пропуск не обнуляет прошлые недели.</p><form id="motivation-preferences" class="settings-stack">' +
    select(
      'goal-days',
      'goalDays',
      'Дней практики в неделю',
      [1, 2, 3].map((n) => ({ id: String(n), label: String(n) })),
      String(m.preferences.nextGoal)
    ) +
    '<label class="check-label"><input type="checkbox" name="paused" ' +
    (m.preferences.paused ? 'checked' : '') +
    '> Пауза цели и автоматических напоминаний</label><label class="check-label"><input type="checkbox" name="automaticNotices" ' +
    (m.preferences.automaticNotices ? 'checked' : '') +
    '> Показывать редкие напоминания внутри приложения</label><p class="timing-note">После первого учебного дня снижение цели применяется со следующей недели. Эта настройка не останавливает таймер смены.</p><button class="outline-button" type="submit">Сохранить цель</button></form></section>' +
    '<section class="panel"><h2>Как начисляется опыт</h2><p>Разбор полного завершённого прохождения — до 20 XP за семейство в неделю; тренировка от развилки — 10 XP с возможностью добрать до 20 за полный разбор. Ошибки не обнуляют полезную практику.</p><p>Сейчас опубликовано одно семейство: максимум 20 XP в неделю. Повторное чтение, прерванная попытка и точное воспроизведение истории новых XP не дают.</p></section>' +
    '<h2>Наблюдения по навыкам</h2>' +
    (recent
      ? evidenceGroup(recent)
      : '<section class="panel"><p>Пока нет завершённых смен. Здесь появятся выполненные и пропущенные критерии, а не предположение о ваших способностях.</p></section>') +
    (m.evidence.length > 1
      ? '<details class="panel" data-disclosure="other-evidence"><summary>Другие условия прохождения</summary>' +
        m.evidence.slice(1).map(evidenceGroup).join('') +
        '</details>'
      : '') +
    '<section class="panel"><h2>История смен</h2>' +
    (m.history.length
      ? m.history
          .map(
            (r) =>
              '<button class="history-row history-button shift-history-button" data-action="history" ' +
              attr('id', r.runId) +
              '><div><strong>' +
              esc(r.title) +
              '</strong><span>' +
              when(r.at) +
              ' · ' +
              esc(modes[r.mode]) +
              (r.origin ? ' · от развилки' : '') +
              '</span></div><span>' +
              r.episodePoints +
              ' / ' +
              r.possibleEpisodePoints +
              ' в эпизоде</span></button>'
          )
          .join('')
      : '<p>Начните первую смену — она доступна без набора предварительных очков.</p>') +
    '</section>' +
    '<section class="panel"><h2>Достижения</h2>' +
    m.awardRules
      .map(
        (a) =>
          '<div class="achievement ' +
          (m.awards.some((x) => x.id === a.id) ? 'unlocked' : '') +
          '"><div><strong>' +
          esc(a.title) +
          '</strong><small>' +
          esc(a.description) +
          '</small><small>' +
          (m.awards.some((x) => x.id === a.id) ? 'Получено' : 'Пока не получено') +
          '</small></div></div>'
      )
      .join('') +
    '</section>' +
    (m.archives.length
      ? '<details class="panel" data-disclosure="archives"><summary>Завершённые недели</summary>' +
        m.archives
          .map(
            (p) =>
              '<p>' + esc(p.period_id) + ' · ' + p.score + ' СП · ' + esc(bands[p.band]) + '</p>'
          )
          .join('') +
        '<p>Это сохранённые итоги, не действующие сезонные очки.</p></details>'
      : '') +
    '</div>'
  );
}
export function motivationLeaders(model) {
  const x = model.motivationLeaders,
    m = model.boot.motivation;
  const tabs =
    '<div class="tabs" role="group" aria-label="Область рейтинга">' +
    [
      ['crew', 'Бригада'],
      ['depot', 'Депо'],
      ['company', 'Компания'],
    ]
      .map(([id, label]) =>
        button(
          label,
          'scope',
          attr('id', id) + ' aria-pressed="' + (model.scope === id) + '"',
          'tab ' + (model.scope === id ? 'active' : '')
        )
      )
      .join('') +
    '</div>';
  if (!x)
    return (
      heading('Добровольное соревнование', 'Результаты недели') +
      tabs +
      '<p role="status">Проверяем сопоставимые результаты…</p>'
    );
  return (
    '<div class="reading-column">' +
    heading(
      'Добровольное соревнование',
      'Результаты недели',
      'Качество решений в одинаковых условиях, не количество повторов.'
    ) +
    tabs +
    '<section class="panel"><h2>Ваш результат</h2><p class="practice-number">' +
    x.me.score +
    ' <span>из 100 СП</span></p><p>' +
    (x.me.rank
      ? 'Место ' + x.me.rank + ' в сопоставимой группе.'
      : x.insufficientParticipants
        ? 'Места пока не показываются: нужно пять сопоставимых участников с результатом.'
        : 'Для этой попытки место не сформировано.') +
    '</p><p>' +
    esc(bands[x.band] || 'Участие не выбрано') +
    (x.archived ? ' · завершённая неделя' : '') +
    '</p>' +
    (!x.optIn && !x.archived
      ? button(
          'Участвовать на этой неделе',
          'period-entry',
          attr('entry', 'join') + ' ' + attr('period', m.period.id),
          'outline-button'
        )
      : '') +
    '</section>' +
    (!x.insufficientParticipants
      ? '<section class="panel"><h2>Сопоставимая группа</h2><div class="v2-leader-table">' +
        x.rows
          .map(
            (r) =>
              '<div class="criterion-row ' +
              (r.me ? 'is-me' : '') +
              '"><span>' +
              r.rank +
              '</span><strong>' +
              esc(r.name) +
              (r.me ? ' · Вы' : '') +
              '</strong><span>' +
              r.score +
              ' СП</span></div>'
          )
          .join('') +
        '</div><p>Одинаковые баллы — одинаковое место. Скорость чтения не используется для разрешения ничьих.</p>' +
        (x.offset
          ? button(
              'Предыдущая страница',
              'rank-page',
              attr('offset', Math.max(0, x.offset - x.limit)),
              'outline-button'
            )
          : '') +
        (x.hasMore
          ? button(
              'Следующая страница',
              'rank-page',
              attr('offset', x.offset + x.limit),
              'outline-button'
            )
          : '') +
        '</section>'
      : '<section class="panel"><p>Показан только ваш личный результат. Другие классы, варианты и режимы времени сюда не подмешиваются.</p></section>') +
    (m.archives.length
      ? '<form id="rank-period-form" class="panel settings-stack">' +
        select(
          'rank-period',
          'periodId',
          'Неделя',
          [
            { id: '', label: 'Текущая неделя' },
            ...m.archives.map((p) => ({ id: p.period_id, label: p.period_id })),
          ],
          model.rankPeriod || ''
        ) +
        '<button class="outline-button" type="submit">Открыть неделю</button></form>'
      : '') +
    '</div>'
  );
}
export function shiftResultControls(run) {
  const r = run.result;
  if (!r) return '';
  const options = r.history
    .filter((h) => h.replayable)
    .map((h) => ({ id: String(h.eventSeq), label: 'Шаг ' + h.step + ': ' + h.title }));
  const receipt = run.debrief?.receipt;
  return (
    '<section class="reading-column result-followup"><section class="panel"><h2>Учебный результат</h2><p>' +
    r.episodePoints +
    ' из ' +
    r.possibleEpisodePoints +
    ' баллов этого эпизода. Это не XP и не сезонные очки.</p><div class="criterion-list">' +
    r.criteria
      .map(
        (c) =>
          '<div class="criterion-row"><strong>' +
          esc(c.label) +
          '</strong><span>' +
          (c.status === 'not_assessed' ? 'Не оценивалось' : c.earned + ' / ' + c.possible) +
          '</span></div>'
      )
      .join('') +
    '</div><p>' +
    (r.rankingEligible
      ? r.seasonPoints + ' СП за эту попытку. В итог недели входит лучший результат, а не сумма.'
      : 'В рейтинг эта попытка не добавляет СП.') +
    '</p></section>' +
    '<section class="panel"><h2>Закрепить разбор</h2>' +
    (run.debrief?.acknowledged
      ? '<p>Разбор отмечен. Начислено ' +
        receipt.deltaXP +
        ' XP; повторное открытие не начисляет их снова.</p>'
      : '<p>Прочитайте причины и альтернативы, затем отметьте разбор. Начисление опыта проверит сервер.</p>' +
        button('Разбор просмотрен', 'debrief-ack', attr('id', run.id))) +
    '</section>' +
    (options.length
      ? '<details class="panel" data-disclosure="branch-practice"><summary>Потренировать другую развилку</summary><form id="shift-replay-form" class="settings-stack">' +
        select(
          'origin-event',
          'originEventSeq',
          'Вернуться к состоянию до решения',
          options,
          options[0].id
        ) +
        '<button class="outline-button" type="submit">Начать практику от развилки</button></form><p>Создастся новая учебная попытка. Исходная история и результат не изменятся.</p>' +
        button(
          'Проверить точное воспроизведение журнала',
          'verify-replay',
          attr('id', run.id),
          'text-back'
        ) +
        '</details>'
      : '') +
    '<div class="shift-actions">' +
    button('Новая смена', 'nav', 'data-view="home"') +
    button('Мои навыки', 'nav', 'data-view="profile"', 'outline-button') +
    '</div></section>'
  );
}
