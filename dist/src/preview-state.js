// EXPLICIT CLIENT-SIDE UX PROTOTYPE. This is NOT the v2 backend, a protected
// assessment, a reference scoring engine or an implementation of the final rubric.
// Load only from preview.html. Production modules must never import this file.
const copy = (s) => structuredClone(s);
const duration = { standard: 20000, extended: 40000, untimed: null };
export function createPreview({ mode = 'training', timingPolicyId = 'untimed' } = {}) {
  return {
    previewVersion: 1,
    id: 'local-ux-preview',
    revision: 0,
    mode: ['training', 'assessment'].includes(mode) ? mode : 'training',
    policy: timingPolicyId in duration ? timingPolicyId : 'untimed',
    phase: 'briefing',
    step: 0,
    inspected: false,
    focus: null,
    a: 'open',
    verified: false,
    bRevealed: false,
    bDone: false,
    promise: false,
    returned: false,
    due: 7,
    breached: false,
    handoff: 'none',
    requestStep: null,
    critical: null,
    criticalSeen: false,
    criticalError: false,
    loyalty: 70,
    safety: 75,
    feedback: null,
    history: [],
    result: null,
  };
}
const action = (command, label, extra = {}) => ({ command, label, ...extra });
const choice = (s, id, label, extra = {}) =>
  action('choose', label, {
    incidentId: s.phase === 'inspection' ? null : s.focus,
    sceneId:
      s.phase === 'inspection' ? 'predeparture' : s.focus === 'a-seat' ? 'a-dialogue' : 'b-safety',
    actionId: id,
    windowId: s.critical?.status === 'open' ? 'critical-b-1' : null,
    ...extra,
  });
function snapshotResult(s, aborted = false) {
  s.phase = 'result';
  s.critical = null;
  const safe =
    s.inspected &&
    s.a === 'resolved' &&
    s.bDone &&
    (!s.promise || s.returned) &&
    !s.criticalError &&
    !s.breached;
  s.result = {
    title: aborted
      ? 'Смена прервана'
      : safe
        ? 'Все дела доведены до результата'
        : 'Есть решения, к которым стоит вернуться',
    summary: aborted
      ? 'Незавершённые дела остались в истории прототипа.'
      : safe
        ? 'Проверка, обнаружение и возврат к пассажиру связаны в одну последовательность.'
        : 'Посмотрите на приёмку, обнаружение проблемы, исполнение обращения и возврат именно к тому пассажиру, которому обещали.',
    criticalError: s.criticalError,
    rankingEligible: false,
    history: copy(s.history),
  };
}
function feedback(s, title, text, impact = { loyalty: 0, safety: 0 }) {
  s.phase = 'feedback';
  s.feedback = { text, impact };
  s.history.push({ title, text });
}
function work(s, title, text, impact = { loyalty: 0, safety: 0 }) {
  s.step++;
  s.loyalty = Math.max(0, Math.min(100, s.loyalty + (impact.loyalty || 0)));
  s.safety = Math.max(0, Math.min(100, s.safety + (impact.safety || 0)));
  if (s.requestStep !== null && s.step >= s.requestStep + 1 && s.handoff === 'requested') {
    s.handoff = 'accepted';
    text += ' Коллега подтвердил получение запроса. Это ещё не исполнение.';
  }
  if (s.requestStep !== null && s.step >= s.requestStep + 2 && s.handoff === 'accepted') {
    s.handoff = 'completed';
    text += ' Коллега сообщил об исполнении. Теперь можно вернуться к пассажиру у места 18.';
  }
  if (s.promise && !s.returned && s.step >= s.due && !s.breached) {
    s.breached = true;
    text += ' Срок обещанного возврата прошёл. Задача всё ещё требует завершения.';
  }
  // Immediate action effects precede due events; a resolved B cannot escalate.
  if (s.step >= 4 && !s.bDone && !s.criticalSeen) {
    s.criticalSeen = true;
    s.bRevealed = true;
    s.critical = { status: 'pending', durationMs: duration[s.policy], deadline: null };
    text +=
      ' Из прохода слышно обращение: пассажиры не могут пройти. Следующий момент откроется после продолжения.';
  }
  feedback(s, title, text, impact);
  if (s.step >= 16) snapshotResult(s);
}
export function expirePreview(state, now) {
  if (
    state.critical?.status !== 'open' ||
    state.critical.deadline == null ||
    now < state.critical.deadline
  )
    return state;
  const s = copy(state);
  const before = s.safety;
  s.critical = null;
  s.criticalError = true;
  s.bDone = true;
  s.safety = 40;
  feedback(
    s,
    'Время критического окна истекло',
    'В локальном прототипе срок истёк. Последствие записано один раз; перезагрузка не даёт новый срок.',
    { loyalty: 0, safety: 40 - before }
  );
  s.feedback.timedOut = true;
  s.revision++;
  return s;
}
export function publicPreview(state, now = Date.now()) {
  const s = state;
  const r = {
    schemaVersion: 2,
    engineVersion: 'ux-prototype-only',
    id: s.id,
    revision: s.revision,
    mode: s.mode,
    timingPolicy: { id: s.policy, durationMs: duration[s.policy] },
    status: s.phase === 'result' ? 'finished' : 'active',
    phase: s.phase,
    stage: s.phase === 'briefing' || s.phase === 'inspection' ? 'predeparture' : 'service',
    step: s.step,
    context: { wagonId: 'wagon-3', zoneId: 'saloon', serviceClass: 'standard' },
    scales: { loyalty: s.loyalty, safety: s.safety },
    actors: [],
    incidents: [],
    observations: [],
    tasks: [],
    scene: null,
    feedback: s.feedback,
    criticalWindow: s.critical ? copy(s.critical) : null,
    result: s.result,
    actions: [],
    serverNow: now,
  };
  if (s.step > 0) {
    r.actors = [
      { id: 'p1', label: 'Пассажир у места 18' },
      { id: 'p2', label: 'Пассажир у места 19' },
    ];
    r.incidents.push({
      id: 'a-seat',
      label: 'Обращение у мест 18–19',
      status:
        s.a === 'resolved'
          ? 'resolved'
          : ['requested', 'accepted'].includes(s.handoff)
            ? 'waiting'
            : 'open',
      handoffStatus: s.handoff === 'none' ? undefined : s.handoff,
    });
    r.observations.push({
      id: 'obs-seats',
      text:
        s.a === 'resolved'
          ? 'У мест 18–19 разговор завершён.'
          : 'У мест 18–19 пассажиры обсуждают размещение. Один из них обращается к вам.',
    });
  }
  if (s.bRevealed) {
    r.incidents.push({
      id: 'b-aisle',
      label: 'Проход в салоне',
      status: s.bDone ? (s.criticalError ? 'failed' : 'resolved') : 'open',
    });
    r.observations.push({
      id: 'obs-aisle',
      text: s.bDone
        ? s.criticalError
          ? 'Срочная ситуация завершилась с ошибкой. Это останется в разборе.'
          : 'Проход свободен. Новых изменений при осмотре не замечено.'
        : 'При осмотре замечен багаж, мешающий проходу пассажиров.',
    });
  }
  if (s.promise)
    r.tasks.push({
      id: 'return-p1',
      type: 'promise',
      actorId: 'p1',
      label: 'Вернуться к пассажиру у места 18',
      status: s.returned ? 'completed' : s.breached ? 'breached' : 'open',
      dueStep: s.due,
    });
  if (s.phase === 'briefing') r.actions = [action('begin', 'Начать приёмку')];
  if (s.phase === 'inspection') {
    r.scene = {
      title: 'Перед выходом к пассажирам',
      speaker: 'Рабочая обстановка',
      text: 'На служебном планшете — сведения о вагоне и обслуживании. В салоне ждут первые пассажиры.',
      prompt: 'Что сделаете?',
    };
    r.actions = [
      choice(s, 'inspect-predeparture', 'Проверить сведения по приёмке'),
      choice(s, 'skip-predeparture', 'Перейти к пассажирам без проверки'),
    ];
  }
  if (s.phase === 'overview') {
    r.actions = [
      action('focus', 'Подойти к местам 18–19', { incidentId: 'a-seat' }),
      ...(s.bRevealed ? [action('focus', 'Вернуться к проходу', { incidentId: 'b-aisle' })] : []),
      action('inspect', 'Осмотреть салон', { zoneId: 'saloon', actionId: 'inspect-saloon' }),
    ];
    if (['requested', 'accepted'].includes(s.handoff))
      r.actions.push(action('wait', 'Дождаться следующего рабочего события'));
    r.actions.push(action('finish', 'Завершить смену'), action('abort', 'Прервать прототип'));
  }
  if (s.phase === 'scene') {
    if (s.focus === 'a-seat') {
      r.scene = {
        title: 'У мест 18–19',
        speaker: 'Пассажир у места 18',
        text:
          s.a === 'resolved'
            ? 'Спасибо, вопрос решён.'
            : s.handoff === 'requested'
              ? 'Запрос коллеге отправлен. Подтверждения получения пока нет.'
              : s.handoff === 'accepted'
                ? 'Коллега принял запрос. Исполнение пока не подтверждено.'
                : s.handoff === 'completed'
                  ? 'Коллега сообщил о выполнении. Пассажир у места 18 всё ещё ожидает вашего ответа.'
                  : 'Мы не можем разобраться с размещением. Помогите, пожалуйста.',
        prompt: 'Ваше действие',
      };
      if (s.a !== 'resolved' && s.handoff === 'none')
        r.actions = [
          ...(!s.promise ? [choice(s, 'promise', 'Уточнить обращение и пообещать вернуться')] : []),
          ...(!s.verified
            ? [choice(s, 'verify', 'Проверить сведения о размещении')]
            : [
                choice(s, 'handoff', 'Передать проверенный запрос коллеге'),
                choice(s, 'resolve-self', 'Самостоятельно подтвердить размещение', {
                  available: s.inspected,
                  unavailableReason: s.inspected ? undefined : 'Сведения по приёмке не проверены',
                }),
              ]),
        ];
      if (s.handoff === 'completed' || (s.a === 'resolved' && s.promise && !s.returned))
        r.actions = [
          choice(s, 'return-p1', 'Сообщить результат пассажиру у места 18'),
          choice(s, 'return-p2', 'Сообщить результат пассажиру у места 19'),
        ];
    } else {
      r.scene = {
        title: 'Проход в салоне',
        speaker: 'Наблюдение',
        text: s.bDone
          ? 'Ситуация уже завершилась. Её последствия останутся в разборе смены.'
          : 'Багаж мешает пассажирам пройти по салону.',
        prompt: s.bDone ? null : 'Как поступите?',
      };
      if (!s.bDone)
        r.actions = [
          choice(
            s,
            'clear-aisle',
            'Проверить ситуацию с владельцем и организовать свободный проход'
          ),
          choice(
            s,
            s.critical?.status === 'open' ? 'ignore-critical' : 'defer-aisle',
            'Продолжить обслуживание, не меняя ситуацию в проходе'
          ),
        ];
    }
    if (s.critical?.status === 'open') {
      if (s.mode === 'training') r.actions.push(action('pause', 'Учебная пауза'));
    } else r.actions.push(action('overview', '← К обзору вагона'));
  }
  if (s.phase === 'feedback') r.actions = [action('continue', 'Продолжить')];
  if (s.phase === 'paused') r.actions = [action('resume', 'Вернуться к решению')];
  return r;
}
export function reducePreview(state, command, now = Date.now()) {
  const expired = expirePreview(state, now);
  if (expired !== state) return expired;
  const visible = publicPreview(state, now);
  const offered = visible.actions.find(
    (a) =>
      a.command === command.type &&
      a.available !== false &&
      ['incidentId', 'sceneId', 'actionId', 'windowId', 'zoneId', 'hintId'].every(
        (k) => (a[k] ?? null) === (command[k] ?? null)
      )
  );
  if (!offered) throw new Error('Это действие сейчас недоступно.');
  const s = copy(state);
  s.revision++;
  if (command.type === 'begin') s.phase = 'inspection';
  if (command.type === 'focus') {
    s.focus = command.incidentId;
    s.phase = 'scene';
  }
  if (command.type === 'overview') s.phase = 'overview';
  if (command.type === 'continue') {
    if (s.critical?.status === 'pending') {
      s.critical.status = 'open';
      s.critical.deadline = s.critical.durationMs == null ? null : now + s.critical.durationMs;
      s.focus = 'b-aisle';
      s.phase = 'scene';
    } else s.phase = 'overview';
  }
  if (command.type === 'inspect') {
    s.bRevealed = true;
    work(
      s,
      'Осмотр салона',
      s.bDone
        ? 'Проход свободен. Нормальное наблюдение тоже полезно. Новых очков за повторный осмотр нет.'
        : 'Вы заметили багаж в проходе. Обращение у мест 18–19 не исчезло.'
    );
  }
  if (command.type === 'wait')
    work(s, 'Ожидание рабочего события', 'Вы дождались следующего сообщения.');
  if (command.type === 'pause') {
    s.resumePhase = s.phase;
    s.phase = 'paused';
    s.critical.remainingMs =
      s.critical.deadline == null ? 0 : Math.max(0, s.critical.deadline - now);
    s.critical.deadline = null;
    s.critical.status = 'suspended';
  }
  if (command.type === 'resume') {
    s.phase = s.resumePhase;
    s.critical.status = 'open';
    s.critical.deadline = s.critical.durationMs == null ? null : now + s.critical.remainingMs;
  }
  if (command.type === 'finish' || command.type === 'abort')
    snapshotResult(s, command.type === 'abort');
  if (command.type === 'choose') {
    const id = command.actionId;
    if (id === 'inspect-predeparture' || id === 'skip-predeparture') {
      s.inspected = id === 'inspect-predeparture';
      work(
        s,
        offered.label,
        s.inspected
          ? 'Вы сверили сведения о вагоне и обслуживании. Теперь у вас есть актуальная информация.'
          : 'Вы начали работу без проверки сведений. Этот выбор останется в истории.'
      );
    }
    if (id === 'promise') {
      s.promise = true;
      work(
        s,
        offered.label,
        'Пассажир у места 18 ждёт, что вы вернётесь с ответом. Его обращение пока открыто.',
        { loyalty: 5, safety: 0 }
      );
    }
    if (id === 'verify') {
      s.verified = true;
      work(
        s,
        offered.label,
        'Сведения о размещении проверены. Теперь запрос можно передать с контекстом.'
      );
    }
    if (id === 'handoff') {
      s.handoff = 'requested';
      s.requestStep = s.step + 1;
      work(s, offered.label, 'Запрос отправлен. Принятие и исполнение ещё не подтверждены.');
    }
    if (id === 'resolve-self') {
      s.a = 'resolved';
      s.returned = true;
      work(
        s,
        offered.label,
        'Размещение подтверждено с пассажирами. Открытые дела в салоне не отменяются.',
        { loyalty: 10, safety: 0 }
      );
    }
    if (id === 'return-p1') {
      s.a = 'resolved';
      s.returned = true;
      work(
        s,
        offered.label,
        'Пассажир у места 18 получил результат. Адресная задача возврата завершена.',
        { loyalty: 10, safety: 0 }
      );
    }
    if (id === 'return-p2')
      work(
        s,
        offered.label,
        'Другой пассажир получил сведения. Обещание пассажиру у места 18 ещё не исполнено.'
      );
    if (id === 'clear-aisle') {
      s.bDone = true;
      s.critical = null;
      work(s, offered.label, 'Проход освобождён. Возвращайтесь к другим известным обращениям.', {
        loyalty: 0,
        safety: 15,
      });
    }
    if (id === 'defer-aisle')
      work(s, offered.label, 'Вы вернулись к обслуживанию. Состояние прохода не изменилось.');
    if (id === 'ignore-critical') {
      s.bDone = true;
      s.critical = null;
      s.criticalError = true;
      const delta = 35 - s.safety;
      work(
        s,
        offered.label,
        'Критическая ситуация оставлена без решения. Ошибка сохранится и после успешной работы с другим обращением.',
        { loyalty: 0, safety: delta }
      );
    }
  }
  return s;
}
