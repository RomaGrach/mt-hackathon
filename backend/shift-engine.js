import { GameError } from './engine.js';
import { comparisonManifest } from './shift-content.js';
const copy = (value) => structuredClone(value);
const terminal = (x) => ['resolved', 'failed', 'completed', 'cancelled'].includes(x.status);
const fail = (code, message, status = 409) => {
  throw new GameError(code, message, status);
};
const offered = (command, label, fields = {}) => ({ command, label, ...fields });
export function actionSeconds(action) {
  if (action.command === 'inspect') return 60;
  if (action.command === 'wait') return 30;
  if (action.command !== 'choose') return 0;
  return (
    {
      'inspect-predeparture': 60,
      'skip-predeparture': 15,
      'acknowledge-and-promise': 30,
      acknowledge: 30,
      'verify-service-info': 60,
      'verify-and-request': 45,
      'confirm-and-return-p1': 30,
      'confirm-and-return-p2': 30,
    }[action.actionId] ?? 45
  );
}
const policy = (s, c) => c.policies[s.context.serviceClass];
const variant = (s, c) => c.variants[s.variantId];
function event(s, type, now, payload = {}, visible = null, causeEventId = null) {
  const e = {
    seq: ++s.lastEventSeq,
    eventId: 'e-' + s.lastEventSeq,
    type,
    causeEventId,
    requestId: s.currentRequestId || null,
    acceptedAt: now,
    stepBefore: s.step,
    stepAfter: s.step,
    revisionAfter: s.revision,
    rulesVersion: s.rulesVersion,
    payload,
    visible,
  };
  s.log.push(e);
  return e;
}
function criterion(s, id, eventId) {
  const r = s.criteria.find((x) => x.id === id);
  if (r?.status === 'assessed' && !r.earned) {
    r.earned = 1;
    r.evidenceEventIds = [eventId];
  }
}
function delta(s, loyalty = 0, safety = 0) {
  s.scales.loyalty = Math.max(0, Math.min(100, s.scales.loyalty + loyalty));
  s.scales.safety = Math.max(0, Math.min(100, s.scales.safety + safety));
}
export function scheduleShiftEvent(s, e) {
  if (!Number.isInteger(e.dueStep) || e.dueStep <= s.step || ![10, 20, 30, 40].includes(e.priority))
    throw new Error('Invalid future event');
  if (
    s.scheduledEvents.some((x) => x.eventId === e.eventId) ||
    s.processedEventIds.includes(e.eventId)
  )
    throw new Error('Duplicate scheduled event');
  if (s.clockMode === 'elapsed' && e.dueSeconds == null) {
    e.dueSeconds =
      s.simulationSeconds + (s.currentActionSeconds || 0) + (e.type === 'handoff-ack' ? 60 : 300);
  }
  s.scheduledEvents.push(copy(e));
}
function task(s, id, label, source, now, fields = {}) {
  const e = event(s, 'task_created', now, { taskId: id, source });
  s.tasks[id] = {
    id,
    label,
    type: source.type,
    status: 'open',
    mandatory: true,
    source,
    createdByEventId: e.eventId,
    completedByEventId: null,
    breachedByEventId: null,
    ...fields,
  };
}
function completeTask(s, id, e, status = 'completed') {
  if (!s.tasks[id]) return;
  s.tasks[id].status = status;
  s.tasks[id].completedByEventId = e.eventId;
  if (s.tasks[id].breachedByEventId && status === 'completed')
    s.tasks[id].breachResolvedByEventId = e.eventId;
}
function revealB(s, c, e) {
  const v = variant(s, c),
    b = s.incidents[v.incidentId];
  b.discovery = 'revealed';
  s.actors.p3.revealed = true;
  if (!s.observations.some((o) => o.id === 'obs-secondary'))
    s.observations.push({
      id: 'obs-secondary',
      text: v.observation + (v.kind === 'service' ? ' ' + policy(s, c).mismatch : ''),
      revealedByEventId: e.eventId,
    });
}
function activateService(s, c, now, e) {
  const v = variant(s, c);
  s.stage = 'service';
  s.actors = {
    p1: { role: 'passenger', label: 'Пассажир у места 18', revealed: true, knownFacts: [] },
    p2: { role: 'passenger', label: 'Пассажир у места 19', revealed: true, knownFacts: [] },
    p3: {
      role: 'passenger',
      label: v.kind === 'safety' ? 'Владелец багажа' : 'Пассажир у памятки',
      revealed: false,
      knownFacts: [],
    },
    crew1: { role: 'crew', label: 'Коллега', revealed: true, knownFacts: [] },
  };
  const handoff = () => ({
    status: 'none',
    requestId: null,
    recipientActorId: null,
    ackEventId: null,
    completionEventId: null,
  });
  s.incidents = {
    'a-seat': {
      id: 'a-seat',
      label: 'Обращение у мест 18–19',
      discovery: 'revealed',
      status: 'open',
      severity: 'routine',
      sceneId: 'a-listen',
      actorIds: ['p1', 'p2'],
      mandatory: true,
      handoff: handoff(),
    },
    [v.incidentId]: {
      id: v.incidentId,
      label: v.title,
      discovery: 'hidden',
      status: 'open',
      severity: 'routine',
      sceneId: 'b-observe',
      actorIds: ['p3'],
      mandatory: true,
      handoff: handoff(),
    },
  };
  s.observations.push({
    id: 'obs-seats',
    text: 'У мест 18–19 обсуждают размещение. Один пассажир обращается к вам. Остальная часть салона ещё не осмотрена.',
    revealedByEventId: e.eventId,
  });
  task(
    s,
    'resolve-a',
    'Разобраться с обращением у мест 18–19',
    { type: 'incident', incidentId: 'a-seat', eventId: e.eventId },
    now,
    { incidentId: 'a-seat' }
  );
  task(
    s,
    'resolve-b',
    v.title,
    { type: 'incident', incidentId: v.incidentId, eventId: e.eventId },
    now,
    { incidentId: v.incidentId }
  );
  scheduleShiftEvent(s, {
    eventId: 'b-escalate',
    type: 'escalate',
    dueStep: v.delayedStep,
    priority: 20,
    incidentId: v.incidentId,
    causeEventId: e.eventId,
  });
}
function processDue(s, c, now) {
  const isDue = (e) =>
    s.clockMode === 'elapsed' && e.dueSeconds != null
      ? e.dueSeconds <= s.simulationSeconds
      : e.dueStep <= s.step;
  const due = s.scheduledEvents
    .filter(isDue)
    .sort(
      (a, b) =>
        (a.dueSeconds ?? a.dueStep) - (b.dueSeconds ?? b.dueStep) ||
        a.priority - b.priority ||
        (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0)
    );
  s.scheduledEvents = s.scheduledEvents.filter((e) => !isDue(e));
  for (const pending of due) {
    if (s.processedEventIds.includes(pending.eventId)) continue;
    s.processedEventIds.push(pending.eventId);
    const a = s.incidents['a-seat'],
      b = s.incidents[pending.incidentId];
    if (
      pending.type === 'handoff-ack' &&
      a?.handoff.status === 'requested' &&
      a.handoff.requestId === pending.requestId &&
      !terminal(a)
    ) {
      const e = event(
        s,
        'handoff_accepted',
        now,
        { scheduledEventId: pending.eventId, requestId: pending.requestId },
        {
          title: 'Коллега принял запрос',
          text: 'Получение запроса подтверждено. Исполнение ещё нужно проверить.',
        },
        pending.causeEventId
      );
      a.handoff.status = 'accepted';
      a.handoff.ackEventId = e.eventId;
      a.sceneId = 'a-return';
      criterion(s, 'confirmed-handoff', e.eventId);
    } else if (pending.type === 'escalate' && b && !terminal(b)) {
      const v = variant(s, c);
      const before = copy(s.scales);
      const e = event(
        s,
        'incident_changed',
        now,
        { scheduledEventId: pending.eventId, incidentId: b.id },
        {
          title: v.critical ? 'Изменение в проходе' : 'Пассажир заметил несоответствие',
          text: v.critical
            ? 'Из прохода слышно обращение: пассажиры не могут пройти. После продолжения потребуется срочное решение.'
            : 'Пассажир обнаружил неверные сведения в памятке. Проход свободен, но доверие к информации снизилось.',
        },
        pending.causeEventId
      );
      revealB(s, c, e);
      b.severity = v.critical ? 'critical' : 'urgent';
      delta(s, v.critical ? 0 : -5, v.critical ? c.effects.escalation : 0);
      e.payload.before = before;
      e.payload.after = copy(s.scales);
      if (v.critical) {
        if (s.criticalWindow) throw new Error('Conflicting critical windows');
        b.sceneId = 'b-critical';
        s.criticalWindow = {
          id: 'critical-b-1',
          incidentId: b.id,
          sceneId: 'b-critical',
          status: 'pending',
          durationMs: s.timingPolicy.durationMs,
          openedAt: null,
          deadline: null,
          remainingMs: null,
          activeElapsedMs: 0,
          causeEventId: e.eventId,
        };
      }
    } else if (
      pending.type === 'task-due' &&
      s.tasks[pending.taskId] &&
      !terminal(s.tasks[pending.taskId]) &&
      !s.tasks[pending.taskId].breachedByEventId
    ) {
      const t = s.tasks[pending.taskId];
      if (!t) throw new Error('Missing due task');
      const before = copy(s.scales);
      delta(s, c.effects.promiseBreach, 0);
      const e = event(
        s,
        'task_deadline_breached',
        now,
        { scheduledEventId: pending.eventId, taskId: t.id, before, after: copy(s.scales) },
        {
          title: 'Возврат задержался',
          text: 'Обещанный срок прошёл. Пассажир у места 18 всё ещё ждёт: к нему можно и нужно вернуться.',
        },
        pending.causeEventId
      );
      t.breachedByEventId = e.eventId;
    } else
      event(
        s,
        'event_skipped',
        now,
        { scheduledEventId: pending.eventId, reason: 'guard-false' },
        null,
        pending.causeEventId
      );
  }
}
export function createShift(
  c,
  {
    id,
    profileId,
    mode = 'training',
    timingPolicyId = 'standard',
    variantId = 'blocked-aisle',
    serviceClass = 'standard',
    competition = null,
    origin = null,
    clockMode = null,
  },
  now
) {
  if (
    !['training', 'assessment'].includes(mode) ||
    !Object.hasOwn(c.timingPolicies, timingPolicyId) ||
    !Object.hasOwn(c.variants, variantId) ||
    !Object.hasOwn(c.policies, serviceClass)
  )
    fail('INVALID_CONFIGURATION', 'Недопустимый режим, вариант или класс.', 400);
  const v = c.variants[variantId];
  const criteria = c.rubric.map((r) => ({
    ...r,
    possible: 1,
    earned: 0,
    status: 'assessed',
    evidenceEventIds: [],
  }));
  const last = criteria.at(-1);
  if (v.kind === 'service')
    Object.assign(last, {
      id: 'service-consistency',
      competency: 'protocol',
      label: 'Согласованность сведений о классе',
    });
  else if (timingPolicyId === 'untimed')
    Object.assign(last, { possible: null, earned: null, status: 'not_assessed' });
  return {
    schemaVersion: 2,
    engineVersion: c.engineVersion,
    id,
    profileId,
    scenarioId: c.id,
    contentVersion: c.version,
    rulesVersion: c.rulesVersion,
    creditFamilyId: c.creditFamilyId,
    variantId,
    variantSelection: { algorithm: 'authored-selection-v1', seed: null },
    mode,
    timingPolicy: { id: timingPolicyId, durationMs: c.timingPolicies[timingPolicyId] },
    comparisonGroup: comparisonManifest(c, serviceClass, variantId, timingPolicyId),
    context: {
      wagonId: 'wagon-3',
      zoneId: 'saloon',
      serviceClass,
      servicePolicyId: c.policies[serviceClass].id,
    },
    status: 'active',
    phase: 'briefing',
    stage: 'inspection',
    revision: 0,
    step: 0,
    clockMode,
    simulationSeconds: 0,
    maxSteps: c.maxSteps,
    inspection: { status: 'pending', eventId: null },
    focusIncidentId: null,
    actors: {},
    incidents: {},
    tasks: {
      predeparture: {
        id: 'predeparture',
        type: 'stage',
        label: 'Проверить готовность вагона',
        status: 'open',
        mandatory: true,
        source: { type: 'stage', stage: 'inspection' },
      },
    },
    observations: [],
    flags: { serviceInfoChecked: false },
    scales: copy(c.initialScales),
    criteria,
    criticalErrors: [],
    scheduledEvents: [],
    processedEventIds: [],
    criticalWindow: null,
    feedback: null,
    resumeState: null,
    decisionCount: 0,
    hasHints: false,
    hasPause: false,
    technicalIssue: false,
    competition,
    origin,
    createdAt: now,
    updatedAt: now,
    lastObservedServerAt: now,
    finishedAt: null,
    lastEventSeq: 0,
    log: [],
    result: null,
  };
}
function sceneFor(s, c) {
  if (s.phase !== 'scene') return null;
  if (s.stage === 'inspection')
    return {
      id: 'predeparture',
      title: 'Перед выходом к пассажирам',
      speaker: 'Приёмка вагона',
      text:
        'На планшете открыта проектная карточка класса «' +
        policy(s, c).label +
        '». ' +
        policy(s, c).fact,
      prompt: 'Как начнёте работу?',
    };
  const i = s.incidents[s.focusIncidentId];
  if (!i) return null;
  if (i.id === 'a-seat')
    return {
      id: i.sceneId,
      title: 'У мест 18–19',
      speaker: 'Пассажир у места 18',
      text:
        i.sceneId === 'a-listen'
          ? 'Мы не можем разобраться с размещением. Помогите, пожалуйста.'
          : i.sceneId === 'a-verify'
            ? 'Пассажир ждёт проверенного решения. ' +
              (s.flags.serviceInfoChecked
                ? 'Сведения по приёмке у вас есть.'
                : 'Сведения о классе при приёмке не проверены.')
            : i.handoff.status === 'requested'
              ? 'Запрос отправлен, но подтверждения получения ещё нет.'
              : i.handoff.status === 'accepted'
                ? 'Коллега принял запрос. Проверьте исполнение и сообщите результат нужному пассажиру.'
                : 'Исполнение подтверждено. Пассажир у места 18 всё ещё ждёт вашего ответа.',
      prompt: 'Ваше действие',
    };
  return {
    id: i.sceneId,
    title: i.label,
    speaker: 'Наблюдение',
    text:
      variant(s, c).scene + (variant(s, c).kind === 'service' ? ' ' + policy(s, c).mismatch : ''),
    prompt: 'Как поступите?',
  };
}
function availableActions(s, c) {
  if (s.status !== 'active') return [];
  const a = (type, label, fields) => offered(type, label, fields);
  const choose = (id, label) =>
    a('choose', label, {
      incidentId: s.stage === 'inspection' ? null : s.focusIncidentId,
      sceneId: s.stage === 'inspection' ? 'predeparture' : s.incidents[s.focusIncidentId]?.sceneId,
      actionId: id,
      windowId: s.criticalWindow?.status === 'open' ? s.criticalWindow.id : null,
    });
  let actions = [];
  if (s.phase === 'briefing') actions = [a('begin', 'Начать приёмку')];
  if (s.phase === 'paused')
    return [a('resume', 'Вернуться к решению'), a('abort', 'Прервать смену')];
  if (s.phase === 'feedback') actions = [a('continue', 'Продолжить')];
  if (s.phase === 'overview') {
    actions = Object.values(s.incidents)
      .filter((i) => i.discovery === 'revealed' && !terminal(i))
      .map((i) => a('focus', i.label, { incidentId: i.id }));
    actions.push(a('inspect', 'Осмотреть салон', { zoneId: 'saloon', actionId: 'inspect-saloon' }));
    if (Object.values(s.incidents).some((i) => !terminal(i)))
      actions.push(a('wait', 'Дождаться следующего рабочего события'));
    if (Object.values(s.incidents).every(terminal) && Object.values(s.tasks).every(terminal))
      actions.push(a('finish', 'Завершить смену'));
  }
  if (s.phase === 'scene') {
    if (s.stage === 'inspection')
      actions = [
        choose('inspect-predeparture', policy(s, c).check),
        choose('skip-predeparture', 'Перейти к пассажирам без проверки'),
      ];
    else if (s.focusIncidentId === 'a-seat') {
      const i = s.incidents['a-seat'];
      if (i.sceneId === 'a-listen')
        actions = [
          ...((s.clockMode === 'elapsed' ? !s.tasks['return-p1'] : s.step < 7)
            ? [choose('acknowledge-and-promise', 'Уточнить обращение и пообещать вернуться')]
            : []),
          choose('acknowledge', 'Уточнить обращение без обещания срока'),
        ];
      if (i.sceneId === 'a-verify')
        actions = [
          s.flags.serviceInfoChecked
            ? choose(
                'verify-and-request',
                'Сверить размещение по проверенной схеме и передать запрос коллеге'
              )
            : choose('verify-service-info', 'Сначала проверить сведения о классе'),
          choose('resolve-without-verification', 'Завершить разговор без проверки размещения'),
        ];
      if (['accepted', 'completed'].includes(i.handoff.status))
        actions = [
          choose(
            'confirm-and-return-p1',
            'Проверить исполнение и сообщить результат пассажиру у места 18'
          ),
          choose(
            'confirm-and-return-p2',
            'Проверить исполнение и сообщить результат пассажиру у места 19'
          ),
        ];
    } else {
      const v = variant(s, c);
      actions =
        v.kind === 'safety'
          ? v.safeActions.map((x) => choose(x.id, x.label))
          : [choose(policy(s, c).actionId, policy(s, c).correction)];
      actions.push(
        choose(
          s.criticalWindow?.status === 'open' ? 'unsafe-deferral' : 'defer-secondary',
          v.kind === 'safety'
            ? 'Продолжить обслуживание, оставив проход без изменений'
            : 'Оставить памятку без исправления и продолжить обслуживание'
        )
      );
    }
    if (!s.criticalWindow || s.criticalWindow.status !== 'open') {
      if (s.stage === 'service') actions.push(a('overview', '← К обзору вагона'));
    }
    if (s.mode === 'training') actions.push(a('hint', 'Учебная подсказка', { hintId: 'context' }));
  }
  if (s.mode === 'training' && s.phase !== 'briefing') actions.push(a('pause', 'Учебная пауза'));
  actions.push(a('abort', 'Прервать смену'));
  if (s.phase === 'scene' && s.stage === 'service' && !s.criticalWindow) {
    for (const i of Object.values(s.incidents))
      if (i.discovery === 'revealed' && !terminal(i) && i.id !== s.focusIncidentId)
        actions.push(a('focus', i.label, { incidentId: i.id }));
  }
  return actions.map((x) => ({
    ...x,
    durationSeconds:
      s.clockMode === 'elapsed'
        ? actionSeconds(x)
        : ['choose', 'inspect', 'wait'].includes(x.command)
          ? 30
          : 0,
  }));
}
export function publicShiftState(s, c, now) {
  const visible = Object.values(s.incidents).filter((i) => i.discovery === 'revealed');
  const w = s.criticalWindow;
  return {
    schemaVersion: 2,
    engineVersion: s.engineVersion,
    id: s.id,
    scenarioId: s.scenarioId,
    contentVersion: s.contentVersion,
    revision: s.revision,
    mode: s.mode,
    timingPolicy: copy(s.timingPolicy),
    status: s.status,
    phase: s.phase,
    stage: s.stage,
    step: s.step,
    simulationSeconds: s.clockMode === 'elapsed' ? s.simulationSeconds : s.step * 30,
    clockMode: s.clockMode || 'legacy',
    focusIncidentId: s.focusIncidentId,
    context: {
      wagonId: s.context.wagonId,
      zoneId: s.context.zoneId,
      serviceClass: s.context.serviceClass,
      serviceClassLabel: policy(s, c).label,
    },
    scales: copy(s.scales),
    actors: Object.entries(s.actors)
      .filter(([, a]) => a.revealed)
      .map(([id, a]) => ({ id, label: a.label })),
    incidents: visible.map((i) => ({
      id: i.id,
      label: i.label,
      status: i.status,
      severity: i.severity,
      handoffStatus: i.handoff.status === 'none' ? null : i.handoff.status,
    })),
    observations: s.observations.map((o) => ({ id: o.id, text: o.text })),
    tasks: Object.values(s.tasks)
      .filter((t) => !t.incidentId || visible.some((i) => i.id === t.incidentId))
      .map((t) => ({
        id: t.id,
        type: t.type,
        label: t.label,
        status: t.status,
        actorId: t.actorId || null,
        dueStep: t.dueStep ?? null,
        dueSeconds: t.dueSeconds ?? (t.dueStep == null ? null : t.dueStep * 30),
        overdue: !!t.breachedByEventId && t.status !== 'completed',
      })),
    scene: sceneFor(s, c),
    actions: availableActions(s, c),
    hintText: s.mode === 'training' ? s.lastHint || null : null,
    feedback: s.feedback
      ? {
          text: s.feedback.text,
          impact: copy(s.feedback.impact),
          timedOut: !!s.feedback.timedOut,
          ...(s.mode === 'training' ? { explanation: s.feedback.explanation } : {}),
        }
      : null,
    criticalWindow: w
      ? w.status === 'pending'
        ? { status: 'pending' }
        : {
            id: w.id,
            status: w.status,
            durationMs: w.durationMs,
            deadline: w.deadline,
            remainingMs: w.remainingMs,
            openedAt: w.openedAt,
          }
      : null,
    history: s.log
      .filter((e) => e.visible)
      .map((e) => ({ eventSeq: e.seq, title: e.visible.title, text: e.visible.text })),
    result: s.result ? copy(s.result) : null,
    serverNow: Math.max(now, s.lastObservedServerAt),
  };
}
function finish(s, c, now, reason = 'finished') {
  if (reason !== 'finished') {
    for (const i of Object.values(s.incidents)) if (!terminal(i)) i.status = 'failed';
    for (const t of Object.values(s.tasks)) if (!terminal(t)) t.status = 'failed';
  }
  s.status = reason === 'aborted' ? 'aborted' : 'completed';
  s.phase = 'result';
  s.finishedAt = now;
  s.criticalWindow = null;
  const reasons = [];
  if (reason !== 'finished') reasons.push(reason);
  if (s.criticalErrors.length) reasons.push('critical_error');
  if (s.inspection.status !== 'passed') reasons.push('inspection_not_passed');
  if (s.scales.loyalty < c.thresholds.loyalty || s.scales.safety < c.thresholds.safety)
    reasons.push('scale_threshold');
  if (Object.values(s.incidents).some((i) => i.mandatory && i.status !== 'resolved'))
    reasons.push('incident_not_resolved');
  if (
    Object.values(s.tasks).some(
      (t) =>
        t.mandatory &&
        (t.status !== 'completed' || (t.breachedByEventId && !t.breachResolvedByEventId))
    )
  )
    reasons.push('task_not_completed');
  const passed = reasons.length === 0;
  event(
    s,
    'result_created',
    now,
    { passed, reasons },
    {
      title: 'Итог всей смены',
      text: passed
        ? 'Обязательные дела завершены без критической ошибки.'
        : 'Зачёт не получен. История сохранена для разбора и новой практики.',
    }
  );
  s.result = {
    schemaVersion: 2,
    engineVersion: s.engineVersion,
    runId: s.id,
    scenarioId: s.scenarioId,
    contentVersion: s.contentVersion,
    rulesVersion: s.rulesVersion,
    creditFamilyId: s.creditFamilyId,
    mode: s.mode,
    timingPolicy: copy(s.timingPolicy),
    variantId: s.variantId,
    comparisonGroup: copy(s.comparisonGroup),
    origin: copy(s.origin),
    completedAt: now,
    acceptedAt: now,
    passed,
    reasons,
    title:
      reason === 'aborted'
        ? 'Смена прервана'
        : passed
          ? 'Дела доведены до результата'
          : 'Нужна практика',
    summary: passed
      ? 'Посмотрите, как обнаружение, проверка и адресный возврат повлияли на исход.'
      : 'Ошибку не компенсируют другие баллы. Разбор показывает конкретный следующий шаг.',
    scales: copy(s.scales),
    criticalError: s.criticalErrors.length > 0,
    criticalErrors: copy(s.criticalErrors),
    criteria: copy(s.criteria),
    episodePoints: 10 * s.criteria.reduce((n, r) => n + (r.earned || 0), 0),
    possibleEpisodePoints: 10 * s.criteria.reduce((n, r) => n + (r.possible || 0), 0),
    history: s.log
      .filter((e) => e.visible)
      .map((e) => ({
        eventSeq: e.seq,
        title: e.visible.title,
        text: e.visible.text,
        explanation: e.visible.explanation || null,
        alternative: e.visible.alternative || null,
        replayable: !e.inherited && ['action', 'critical_timeout'].includes(e.type),
        inherited: !!e.inherited,
        step: e.stepAfter,
        at: e.acceptedAt,
        impact: e.payload.before ? { before: e.payload.before, after: e.payload.after } : null,
      })),
    decisionCount: s.decisionCount,
    technicalIssue: s.technicalIssue,
    hasHints: s.hasHints,
    hasPause: s.hasPause,
    rankingEligible: false,
    rankingIneligibleReason: 'not_competitive',
    seasonPoints: 0,
    freshCriterionIds: s.criteria
      .filter((r) =>
        r.evidenceEventIds.some((id) => s.log.some((e) => e.eventId === id && !e.inherited))
      )
      .map((r) => r.id),
    notForEmploymentDecisions: true,
    reviewStatus: c.reviewStatus,
  };
}
export function reduceShift(state, command, c, acceptedAt, requestId = null) {
  const now = Math.max(acceptedAt, state.lastObservedServerAt);
  const isTimeout = command.type === '_timeout';
  let selection;
  if (isTimeout) {
    if (
      state.criticalWindow?.status !== 'open' ||
      state.criticalWindow.deadline === null ||
      now < state.criticalWindow.deadline
    )
      return state;
    selection = { label: 'Срок критического окна истёк' };
  } else {
    selection = availableActions(state, c).find(
      (a) =>
        a.command === command.type &&
        ['incidentId', 'sceneId', 'actionId', 'windowId', 'zoneId', 'hintId'].every(
          (k) => (a[k] ?? null) === (command[k] ?? null)
        )
    );
    if (!selection) fail('WRONG_PHASE', 'Это действие сейчас недоступно. Обновите состояние.');
    if (
      state.criticalWindow?.status === 'open' &&
      state.criticalWindow.deadline !== null &&
      now >= state.criticalWindow.deadline
    )
      fail('DEADLINE_EXPIRED', 'Критическое окно истекло. Обновите состояние.');
  }
  const s = copy(state);
  s.revision++;
  s.updatedAt = now;
  s.lastObservedServerAt = now;
  s.currentRequestId = requestId;
  const before = copy(s.scales);
  const startLog = s.log.length;
  const working = ['choose', 'inspect', 'wait', '_timeout'].includes(command.type);
  s.currentActionSeconds = working
    ? actionSeconds({ command: command.type, actionId: command.actionId })
    : 0;
  const e = event(
    s,
    isTimeout ? 'critical_timeout' : working ? 'action' : 'navigation',
    now,
    { command: copy(command) },
    working ? { title: selection.label, text: '' } : null
  );
  let text = '',
    explanation =
      'Действие меняет рабочую ситуацию. Чтение и переходы между делами не расходуют шаги.';
  const type = command.type,
    id = command.actionId,
    a = s.incidents['a-seat'];
  if (type === 'begin') {
    s.phase = 'scene';
    s.stage = 'inspection';
  }
  if (type === 'focus') {
    s.focusIncidentId = command.incidentId;
    s.phase = 'scene';
  }
  if (type === 'overview') {
    s.phase = 'overview';
    s.focusIncidentId = null;
  }
  if (type === 'continue') {
    s.feedback = null;
    if (s.criticalWindow?.status === 'pending') {
      const w = s.criticalWindow;
      w.status = 'open';
      w.openedAt = now;
      w.deadline = w.durationMs === null ? null : now + w.durationMs;
      s.focusIncidentId = w.incidentId;
      s.phase = 'scene';
      event(s, 'window_opened', now, { window: copy(w) }, null, w.causeEventId);
    } else {
      s.phase = 'overview';
      s.focusIncidentId = null;
    }
  }
  if (type === 'pause' || type === 'hint') {
    if (type === 'hint') {
      s.hasHints = true;
      s.lastHint =
        'Проверьте, какие сведения уже подтверждены и кому именно вы обещали ответ. Передача, принятие и исполнение — разные этапы.';
      event(
        s,
        'hint_used',
        now,
        { hintId: command.hintId },
        {
          title: 'Учебная подсказка',
          text: 'Отделяйте проверенные сведения от обещаний. Передача, её принятие и исполнение — разные этапы. Приоритет зависит от наблюдаемого состояния.',
        }
      );
    }
    if (type === 'pause' || s.criticalWindow?.status === 'open') {
      s.hasPause = true;
      s.resumeState = { phase: s.phase };
      s.phase = 'paused';
      const w = s.criticalWindow;
      if (w?.status === 'open') {
        w.remainingMs = w.deadline === null ? null : Math.max(0, w.deadline - now);
        w.activeElapsedMs += now - w.openedAt;
        w.deadline = null;
        w.status = 'suspended';
      }
      event(s, 'paused', now, { window: copy(w || null) });
    }
  }
  if (type === 'resume') {
    s.phase = s.resumeState.phase;
    s.resumeState = null;
    const w = s.criticalWindow;
    if (w?.status === 'suspended') {
      w.status = 'open';
      w.openedAt = now;
      w.deadline = w.durationMs === null ? null : now + w.remainingMs;
    }
    event(s, 'resumed', now, { window: copy(w || null) });
  }
  if (type === 'inspect') {
    const observed = s.observations.find((o) => o.id === 'obs-seats');
    if (observed)
      observed.text = observed.text.replace(' Остальная часть салона ещё не осмотрена.', '');
    const b = s.incidents[variant(s, c).incidentId];
    if (!terminal(b) && b.discovery === 'hidden') {
      revealB(s, c, e);
      if (s.step + 1 < variant(s, c).delayedStep) {
        criterion(s, 'early-discovery', e.eventId);
        delta(s, 0, c.effects.earlyDiscovery);
      }
      text =
        variant(s, c).observation +
        (variant(s, c).kind === 'service' ? ' ' + policy(s, c).mismatch : '');
    } else
      text =
        b.status === 'failed'
          ? 'Ситуация завершилась с ошибкой. Повторный осмотр не отменяет её последствия.'
          : terminal(b)
            ? 'Осмотр подтверждает: проход свободен, новых изменений нет. Повторное наблюдение не даёт дополнительных учебных баллов.'
            : 'Состояние уже известного дела не изменилось. Осмотр не завершает его автоматически.';
  }
  if (type === 'wait')
    text = 'Вы дождались следующего рабочего события. Само ожидание не даёт баллов.';
  if (type === 'choose') {
    if (s.stage === 'inspection') {
      const checked = id === 'inspect-predeparture';
      s.inspection = { status: checked ? 'passed' : 'skipped', eventId: e.eventId };
      s.flags.serviceInfoChecked = checked;
      s.flags.servicePolicyChecked = checked ? policy(s, c).id : null;
      completeTask(s, 'predeparture', e, checked ? 'completed' : 'failed');
      if (checked) criterion(s, 'predeparture', e.eventId);
      text = checked
        ? 'Сведения проверены. ' + policy(s, c).fact
        : 'Приёмка пропущена. Перед передачей обращения понадобится отдельная проверка, но она не заменит приёмку задним числом.';
      activateService(s, c, now, e);
    } else if (id === 'acknowledge-and-promise' || id === 'acknowledge') {
      criterion(s, 'acknowledge-person', e.eventId);
      delta(s, c.effects.acknowledge, 0);
      a.sceneId = 'a-verify';
      const promise = id === 'acknowledge-and-promise';
      s.actors.p1.knownFacts.push(promise ? 'return-promised' : 'return-required');
      task(
        s,
        'return-p1',
        'Вернуться к пассажиру у места 18',
        {
          type: promise ? 'promise' : 'incident',
          incidentId: 'a-seat',
          actorId: 'p1',
          eventId: e.eventId,
        },
        now,
        {
          incidentId: 'a-seat',
          actorId: 'p1',
          dueStep: promise ? (s.clockMode === 'elapsed' ? s.step + 6 : 7) : null,
          ...(promise && s.clockMode === 'elapsed'
            ? { dueSeconds: s.simulationSeconds + s.currentActionSeconds + 300 }
            : {}),
        }
      );
      if (promise)
        scheduleShiftEvent(s, {
          eventId: 'return-due',
          type: 'task-due',
          taskId: 'return-p1',
          dueStep: s.clockMode === 'elapsed' ? s.step + 6 : 7,
          priority: 30,
          causeEventId: e.eventId,
        });
      text = promise
        ? s.clockMode === 'elapsed'
          ? 'Вы обещали вернуться к пассажиру у места 18 через 5 минут игрового времени. Срок виден в списке обещаний.'
          : 'Пассажир у места 18 ждёт возврата до конца рабочего шага 7. Обращение пока не решено.'
        : 'Обращение уточнено. После проверки нужно сообщить результат тому же пассажиру.';
    } else if (id === 'verify-service-info') {
      s.flags.serviceInfoChecked = true;
      s.flags.servicePolicyChecked = policy(s, c).id;
      text =
        'Сведения о классе проверены сейчас. ' +
        policy(s, c).fact +
        ' Пропуск приёмки остаётся в истории.';
    } else if (id === 'verify-and-request') {
      criterion(s, 'verify-documents', e.eventId);
      a.status = 'waiting';
      a.sceneId = 'a-await';
      a.handoff = {
        status: 'requested',
        requestId: 'handoff-' + e.eventId,
        recipientActorId: 'crew1',
        requestedAtStep: s.step + 1,
        ackEventId: null,
        completionEventId: null,
      };
      scheduleShiftEvent(s, {
        eventId: 'a-ack-' + e.eventId,
        type: 'handoff-ack',
        requestId: a.handoff.requestId,
        dueStep: s.step + 2,
        priority: 10,
        causeEventId: e.eventId,
      });
      text =
        'Размещение сверено по схеме класса «' +
        policy(s, c).label +
        '». Проверенный запрос отправлен коллеге; принятие ещё не подтверждено.';
      event(
        s,
        'handoff_requested',
        now,
        { requestId: a.handoff.requestId, servicePolicyId: policy(s, c).id },
        null,
        e.eventId
      );
    } else if (id === 'resolve-without-verification') {
      a.status = 'failed';
      completeTask(s, 'resolve-a', e, 'failed');
      completeTask(s, 'return-p1', e, 'failed');
      delta(s, -10, 0);
      text =
        'Обращение закрыто без проверенного решения. Пассажир не получил подтверждения размещения.';
    } else if (id === 'confirm-and-return-p1' || id === 'confirm-and-return-p2') {
      if (a.handoff.status !== 'completed') {
        const done = event(
          s,
          'handoff_completed',
          now,
          { requestId: a.handoff.requestId },
          {
            title: 'Исполнение проверено',
            text: 'Вы проверили сообщение коллеги о выполнении переданного запроса.',
          },
          a.handoff.ackEventId
        );
        a.handoff.status = 'completed';
        a.handoff.completionEventId = done.eventId;
      }
      if (id.endsWith('p1')) {
        a.status = 'resolved';
        const observed = s.observations.find((o) => o.id === 'obs-seats');
        if (observed)
          observed.text =
            'У мест 18–19 обращение завершено. Пассажир получил проверенный результат.';
        completeTask(s, 'resolve-a', e);
        completeTask(s, 'return-p1', e);
        criterion(s, 'return-to-person', e.eventId);
        delta(s, c.effects.return, 0);
        text =
          'Результат сообщён пассажиру у места 18. Адресная задача завершена' +
          (s.tasks['return-p1'].breachedByEventId
            ? ' с задержкой; прежний штраф не отменён.'
            : '.');
      } else
        text =
          'Пассажир у места 19 получил сведения. Пассажир у места 18 всё ещё ждёт: адресная задача не завершена.';
    } else if (variant(s, c).safeActions.some((x) => x.id === id) || id === policy(s, c).actionId) {
      const b = s.incidents[variant(s, c).incidentId];
      b.status = 'resolved';
      completeTask(s, 'resolve-b', e);
      const observed = s.observations.find((o) => o.id === 'obs-secondary');
      if (observed)
        observed.text =
          variant(s, c).kind === 'safety'
            ? 'Проход проверен и свободен.'
            : 'Сведения в памятке сверены и исправлены.';
      if (variant(s, c).kind === 'safety') {
        delta(s, 0, c.effects.safeResolution);
        criterion(s, 'timely-safety', e.eventId);
        text = 'Проход освобождён и проверен. Можно вернуться к другим делам.';
      } else {
        delta(s, 5, 0);
        criterion(s, 'service-consistency', e.eventId);
        s.flags.correctedPolicyId = policy(s, c).id;
        text = 'Памятка исправлена по проверенной схеме. ' + policy(s, c).fact;
      }
      if (s.criticalWindow) {
        event(
          s,
          'window_resolved',
          now,
          {
            window: copy(s.criticalWindow),
            activeElapsedMs: s.criticalWindow.activeElapsedMs + now - s.criticalWindow.openedAt,
          },
          null,
          e.eventId
        );
        s.criticalWindow = null;
      }
    } else if (id === 'defer-secondary')
      text =
        'Известное дело оставлено без изменения. Следующие рабочие действия могут изменить его состояние.';
  }
  if (isTimeout || id === 'unsafe-deferral') {
    const b = s.incidents[s.criticalWindow.incidentId];
    b.status = 'failed';
    completeTask(s, 'resolve-b', e, 'failed');
    const observed = s.observations.find((o) => o.id === 'obs-secondary');
    if (observed)
      observed.text = 'Срочная ситуация завершилась с ошибкой. Её последствия сохранены в истории.';
    const code = isTimeout ? 'critical_timeout' : 'unsafe_deferral';
    s.criticalErrors.push({ code, evidenceEventId: e.eventId, incidentId: b.id });
    delta(s, 0, isTimeout ? c.effects.timeout : c.effects.unsafeDeferral);
    event(s, 'window_failed', now, { window: copy(s.criticalWindow), code }, null, e.eventId);
    s.criticalWindow = null;
    text = isTimeout
      ? 'Срок истёк на сервере. Поздний выбор не выполнен; критическая ошибка сохранена один раз.'
      : 'Обеспечение безопасного прохода отложено в критическом окне. Ошибка сохраняется независимо от других успешных действий.';
  }
  if (working) {
    if (type === 'choose' || type === 'inspect') s.decisionCount++;
    const teaching = c.debrief[id || type];
    if (teaching) explanation = teaching.why;
    e.visible.text = text;
    e.visible.explanation = teaching?.why || null;
    e.visible.alternative = teaching?.alternative || null;
    e.stepAfter = ++s.step;
    if (s.clockMode === 'elapsed') {
      s.simulationSeconds += s.currentActionSeconds;
      e.payload.durationSeconds = s.currentActionSeconds;
      e.payload.simulationSeconds = s.simulationSeconds;
      explanation = explanation
        .replace(/рабочий шаг/g, 'отрезок игрового времени')
        .replace(/рабочие шаги/g, 'игровое время')
        .replace(/шаги/g, 'время');
    }
    e.payload.before = before;
    e.payload.after = copy(s.scales);
    processDue(s, c, now);
    const additions = s.log
      .slice(startLog + 1)
      .filter((x) => x.visible)
      .map((x) => x.visible.text);
    s.feedback = {
      text: [text, ...additions].join(' '),
      explanation,
      impact: {
        loyalty: s.scales.loyalty - before.loyalty,
        safety: s.scales.safety - before.safety,
      },
      timedOut: isTimeout,
    };
    s.phase = 'feedback';
    if (s.step >= s.maxSteps) finish(s, c, now, 'step_limit');
  }
  if (type === 'finish' || type === 'abort')
    finish(s, c, now, type === 'abort' ? 'aborted' : 'finished');
  delete s.currentRequestId;
  return s;
}
export function expireShift(s, c, now) {
  return s.criticalWindow?.status === 'open' &&
    s.criticalWindow.deadline !== null &&
    Math.max(now, s.lastObservedServerAt) >= s.criticalWindow.deadline
    ? reduceShift(s, { type: '_timeout' }, c, now)
    : s;
}
