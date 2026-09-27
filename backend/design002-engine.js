import { assertV2 } from './v2-validation.js';
const clone = (x) => structuredClone(x);
const clamp = (n) => Math.max(0, Math.min(100, n));
const round = (n) => Math.round(n * 100) / 100;
const template = (text, p) => text.replaceAll('{seat}', String(p.seat));
const definition = (c, p) => c.problems[p.templateId];
function random(seed) {
  let n = 2166136261;
  for (const char of String(seed)) n = Math.imul(n ^ char.charCodeAt(0), 16777619);
  return () => {
    n += 0x6d2b79f5;
    let t = Math.imul(n ^ (n >>> 15), 1 | n);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const shuffle = (items, rng) => {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
function log(s, type, title, text, now, extra = {}) {
  const e = {
    seq: ++s.lastEventSeq,
    eventId: `${s.id}-e${s.lastEventSeq}`,
    type,
    title,
    text,
    turn: s.step,
    at: now,
    revisionAfter: s.revision,
    ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== undefined)),
  };
  s.log.push(e);
  return e;
}
function scales(s) {
  s.scales.loyalty = round(s.passengers.reduce((n, p) => n + p.loyalty, 0) / s.passengers.length);
}
function affect(s, effect, source) {
  const selected =
    effect.audience === 'all'
      ? s.passengers
      : [...s.passengers]
          .sort((a, b) => Math.abs(a.seat - source.seat) - Math.abs(b.seat - source.seat))
          .slice(0, effect.audience || 1);
  const changes = [];
  for (const p of selected) {
    const before = p.loyalty;
    p.loyalty = clamp(before + (effect.loyalty || 0));
    if (p.loyalty !== before) changes.push({ seat: p.seat, before, after: p.loyalty });
  }
  const before = s.scales.safety;
  s.scales.safety = clamp(before + (effect.safety || 0));
  if (effect.flag) s.flags[effect.flag] = true;
  if (effect.prevent)
    for (const p of s.problems) {
      if (
        p.templateId === effect.prevent &&
        p.parentId === source.parentId &&
        p.status === 'scheduled'
      )
        p.prevented = true;
    }
  scales(s);
  return { passengers: changes, safety: s.scales.safety - before, loyalty: effect.loyalty || 0 };
}
function addTask(s, c, id, source, now, cause) {
  const t = {
    id: 't' + (s.tasks.length + 1),
    templateId: id,
    label: c.tasks[id].label,
    seat: source.seat,
    parentId: source.id,
    status: 'open',
    createdTurn: s.step,
    causeEventId: cause,
  };
  s.tasks.push(t);
  log(
    s,
    'task_created',
    t.label,
    'Новое обязательство' + (t.seat ? ` · место ${t.seat}` : ''),
    now,
    { taskId: t.id, causeEventId: cause }
  );
}
function addProblem(s, c, id, source, now, delay = 0, cause = null) {
  const p = {
    id: 'p' + (s.problems.length + 1),
    templateId: id,
    seat: source.seat || s.passengers[0].seat,
    at: s.step + delay,
    hidden: false,
    status: 'scheduled',
    revealed: false,
    parentId: source.id,
    causeEventId: cause,
    node: 'start',
    startedAt: null,
  };
  s.problems.push(p);
  return p;
}
function publish(s, c, now) {
  for (const p of s.problems) {
    if (p.status !== 'scheduled' || p.at > s.step) continue;
    if (p.prevented) {
      p.status = 'prevented';
      log(
        s,
        'prevented',
        definition(c, p).title,
        'Проверка предотвратила повторное обращение.',
        now,
        { incidentId: p.id, causeEventId: p.causeEventId }
      );
      continue;
    }
    const d = definition(c, p);
    if (
      d.category === 'critical' &&
      s.problems.some((x) => x.status === 'active' && definition(c, x).category === 'critical')
    )
      continue;
    p.status = 'active';
    p.appearedTurn = s.step;
    p.expiresTurn = s.step + d.ttl;
    p.revealed = !p.hidden;
    p.appearanceOrder = ++s.appearanceCounter;
    if (p.revealed) p.knownOrder = ++s.knownCounter;
    log(
      s,
      'appeared',
      d.title,
      p.revealed ? template(d.text, p) : 'Скрытая проблема возникла и пока не была обнаружена.',
      now,
      { incidentId: p.id, hidden: !p.revealed, causeEventId: p.causeEventId }
    );
  }
}
function outcome(s, c, p, o, now, reason = 'choice', spawn = true) {
  p.status = 'resolved';
  p.resolution = reason;
  p.points = o.points;
  p.resolvedTurn = s.step;
  p.outcome = o.text;
  const impact = affect(s, o, p);
  const e = log(
    s,
    reason === 'choice' ? 'action' : reason === 'timeout' ? 'critical_timeout' : 'automatic',
    definition(c, p).title,
    o.text,
    now,
    {
      incidentId: p.id,
      seat: p.seat,
      points: o.points,
      choice: p.choice || null,
      impact,
      reason,
      wasHidden: !p.revealed,
      causeEventId: p.causeEventId,
    }
  );
  p.resultEventId = e.eventId;
  if (spawn) {
    for (const id of o.tasks || []) addTask(s, c, id, p, now, e.eventId);
    if (o.next) addProblem(s, c, o.next, p, now, o.delay || 0, e.eventId);
  }
  if (o.failShiftImmediately) s.fatal = { problemId: p.id, text: o.text };
  if (s.criticalWindow?.incidentId === p.id) s.criticalWindow = null;
  if (s.focusIncidentId === p.id) {
    s.focusIncidentId = null;
    s.phase = 'overview';
  }
}
function taskOutcome(s, c, t, now, success) {
  const d = c.tasks[t.templateId],
    o = success ? d.success : d.worst;
  t.status = success ? 'completed' : 'failed';
  t.outcome = o.text;
  const impact = affect(s, o, t);
  log(s, success ? 'task_completed' : 'task_failed', d.label, o.text, now, {
    taskId: t.id,
    seat: t.seat,
    impact,
    causeEventId: t.causeEventId,
  });
}
function finish(s, c, now, reason) {
  // The pre-generated finite pool is part of the denominator, even on early failure.
  for (const p of s.problems)
    if (['active', 'scheduled'].includes(p.status))
      outcome(s, c, p, definition(c, p).worst, now, 'shift_end', false);
  for (const t of s.tasks) if (t.status === 'open') taskOutcome(s, c, t, now, false);
  s.phase = 'result';
  s.status = reason === 'aborted' ? 'aborted' : s.fatal ? 'failed' : 'completed';
  s.finishedAt = now;
  s.criticalWindow = null;
  s.pendingInspection = null;
  s.focusIncidentId = null;
  const all = s.problems.filter((p) => p.status !== 'prevented');
  const fact = all.reduce((sum, p) => sum + (p.points || 0), 0),
    max = all.length * 2;
  const score = max ? round((fact / max) * 100) : 0;
  log(
    s,
    'finished',
    'Смена завершена',
    s.fatal?.text ||
      (reason === 'aborted'
        ? 'Смена прервана пользователем.'
        : 'Рабочие ходы закончились. Оставшиеся дела получили свои последствия.'),
    now
  );
  s.result = {
    schemaVersion: 2,
    engineVersion: s.engineVersion,
    runId: s.id,
    scenarioId: c.id,
    scenarioVersion: c.version,
    title: s.fatal
      ? 'Смена остановлена'
      : reason === 'aborted'
        ? 'Смена прервана'
        : 'Смена завершена',
    summary: 'Результат учитывает все проблемы смены, включая скрытые и пропущенные.',
    completedAt: now,
    mode: s.mode,
    variantId: s.variantId,
    timingPolicy: s.timingPolicy,
    serviceClass: s.context.serviceClass,
    comparisonGroup: s.comparisonGroup,
    origin: s.origin || null,
    passed: !s.fatal && reason !== 'aborted',
    reasons: s.fatal ? [s.fatal.text] : reason === 'aborted' ? ['Смена прервана'] : [],
    scales: clone(s.scales),
    criticalErrors: s.fatal ? [s.fatal] : [],
    criticalError: !!s.fatal,
    episodePoints: score,
    fact,
    max,
    shiftScore: score,
    competencyGain: reason === 'aborted' || s.origin ? 0 : score,
    criteria: all.map((p) => ({
      id: p.id,
      label: definition(c, p).title,
      status: 'assessed',
      earned: p.points || 0,
      possible: 2,
    })),
    problems: all.map((p) => ({
      id: p.id,
      title: definition(c, p).title,
      seat: p.seat,
      points: p.points || 0,
      resolution: p.resolution,
      discovered: p.revealed,
      choice: p.choice || null,
      text: p.outcome,
      parentId: p.parentId || null,
      alternative:
        definition(c, p).choices.find((o) => o.points === 2)?.label ||
        'Своевременно организовать помощь и передать проверенные сведения.',
    })),
    tasks: s.tasks.map((t) => ({
      id: t.id,
      label: t.label,
      seat: t.seat,
      status: t.status,
      text: t.outcome,
    })),
    history: clone(s.log),
    passengers: clone(s.passengers),
    turns: s.step,
    totalTurns: s.totalTurns,
    stats: {
      resolved: all.filter((p) => p.resolution === 'choice').length,
      automatic: all.filter((p) => p.resolution !== 'choice').length,
      undiscovered: all.filter((p) => !p.revealed).length,
      tasksDone: s.tasks.filter((t) => t.status === 'completed').length,
      tasksMissed: s.tasks.filter((t) => t.status === 'failed').length,
    },
  };
}
function advance(s, c, now) {
  s.step++;
  s.pendingInspection = null;
  if (s.fatal || s.step >= s.totalTurns) {
    finish(s, c, now, 'complete');
    return;
  }
  for (const t of s.tasks) {
    const d = c.tasks[t.templateId];
    if (t.status === 'open' && d.riskAt != null && s.step >= d.riskAt && !t.riskRaised) {
      t.riskRaised = true;
      const e = log(
        s,
        'duty_risk',
        t.label,
        'Невыполненная обязанность оставила непроверенный риск.',
        now,
        { taskId: t.id }
      );
      addProblem(s, c, d.risk, t, now, 0, e.eventId);
    }
  }
  for (const p of [...s.problems]) {
    if (p.status === 'active' && p.expiresTurn <= s.step)
      outcome(s, c, p, definition(c, p).worst, now, 'deadline');
    if (s.fatal) break;
  }
  if (s.fatal) {
    finish(s, c, now, 'complete');
    return;
  }
  publish(s, c, now);
}
export function createDesignShift(c, opts, now) {
  const variantId = opts.variantId ?? 'orientation',
    v = c.variants[variantId],
    pol = c.policies[opts.serviceClass];
  assertV2(
    v &&
      pol &&
      Object.hasOwn(c.timingPolicies, opts.timingPolicyId) &&
      ['training', 'assessment'].includes(opts.mode),
    'INVALID_OPTIONS',
    'Недопустимые условия смены.'
  );
  const rng = random(opts.id),
    count = pol.layout?.seats ?? pol.rows * (pol.sides[0] + pol.sides[1]);
  const seats = shuffle(
    Array.from({ length: count }, (_, i) => i + 1),
    rng
  );
  const passengers = seats
    .slice(0, Math.max(12, Math.floor(count * 0.75)))
    .sort((a, b) => a - b)
    .map((seat) => ({ id: 'passenger-' + seat, seat, loyalty: 75 }));
  const selected = [];
  for (const [category, n] of Object.entries(v.quotas)) {
    const pool = Object.values(c.problems).filter((p) => !p.linkedOnly && p.category === category);
    const order = shuffle(pool, rng);
    for (let i = 0; i < n; i++) selected.push(order[i % order.length]);
  }
  // Meet the hidden quota without exceeding the configured category quotas.
  while (selected.filter((p) => p.hiddenEligible).length < v.hidden) {
    const at = selected.findIndex(
      (p) =>
        !p.hiddenEligible &&
        Object.values(c.problems).some(
          (q) =>
            !q.linkedOnly && q.category === p.category && q.hiddenEligible && !selected.includes(q)
        )
    );
    assertV2(at >= 0, 'INVALID_GENERATOR', 'Недостаточно скрытых ситуаций в библиотеке.', 503);
    selected[at] = shuffle(
      Object.values(c.problems).filter(
        (q) =>
          !q.linkedOnly &&
          q.category === selected[at].category &&
          q.hiddenEligible &&
          !selected.includes(q)
      ),
      rng
    )[0];
  }
  const ordered = shuffle(selected, rng);
  // Spread arrivals; two known cases start alongside duties. Critical cases never start hidden.
  const problems = ordered.map((d, i) => ({
    id: 'p' + (i + 1),
    templateId: d.id,
    seat: passengers[Math.floor(rng() * passengers.length)].seat,
    at:
      d.category === 'critical'
        ? Math.max(3, Math.min(v.turns - 2, Math.floor((i / ordered.length) * (v.turns - 2))))
        : i < 2
          ? 0
          : Math.min(v.turns - 2, Math.floor((i / ordered.length) * (v.turns - 2))),
    hidden: false,
    status: 'scheduled',
    revealed: false,
    node: 'start',
    startedAt: null,
  }));
  const hidden = shuffle(
    problems.filter((p) => c.problems[p.templateId].hiddenEligible),
    rng
  ).slice(0, v.hidden);
  for (const p of hidden) p.hidden = true;
  const s = {
    schemaVersion: 2,
    engineVersion: 'shift-4',
    id: opts.id,
    profileId: opts.profileId,
    mode: opts.mode,
    variantId,
    timingPolicy: { id: opts.timingPolicyId, durationMs: c.timingPolicies[opts.timingPolicyId] },
    context: {
      serviceClass: opts.serviceClass,
      serviceClassLabel: pol.label,
      carriage: 3,
      sides: pol.sides,
      rows: pol.rows,
      seats: count,
      ...(pol.layout ? { layout: structuredClone(pol.layout) } : {}),
    },
    comparisonGroup: {
      scenarioId: c.id,
      contentVersion: c.version,
      engineVersion: c.engineVersion,
      servicePolicyId: opts.serviceClass,
      variantId,
      timingPolicyId: opts.timingPolicyId,
    },
    totalTurns: v.turns,
    step: 0,
    revision: 0,
    lastEventSeq: 0,
    lastObservedServerAt: now,
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
    phase: 'briefing',
    status: 'active',
    scales: { loyalty: 75, safety: 90 },
    passengers,
    problems,
    tasks: [],
    flags: {},
    log: [],
    criticalWindow: null,
    focusIncidentId: null,
    pendingInspection: null,
    appearanceCounter: 0,
    knownCounter: 0,
    result: null,
    competition: null,
    seed: opts.id,
    decisionCount: 0,
  };
  addTask(s, c, 'acceptance', { id: 'start', seat: 0 }, now, null);
  addTask(s, c, 'service', { id: 'start', seat: 0 }, now, null);
  return s;
}
function choices(s, c, p) {
  const d = definition(c, p);
  return p.node === 'start' ? d.choices : d.dialogue[p.node].choices;
}
const a = (command, label, fields = {}) => ({ command, label, available: true, ...fields });
export function designActions(s, c) {
  if (s.phase === 'result') return [];
  if (s.phase === 'briefing') return [a('begin', 'Начать смену'), a('abort', 'Прервать смену')];
  const actions = [];
  const active = s.problems
    .filter((p) => p.status === 'active' && p.revealed)
    .sort((x, y) => x.knownOrder - y.knownOrder);
  if (s.phase === 'scene') {
    const p = s.problems.find((p) => p.id === s.focusIncidentId);
    for (const o of choices(s, c, p))
      actions.push(
        a('choose', o.label, {
          incidentId: p.id,
          sceneId: p.node,
          actionId: o.id,
          windowId: s.criticalWindow?.incidentId === p.id ? s.criticalWindow.id : null,
          available: !o.requires || !!s.flags[o.requires],
          unavailableReason:
            o.requires && !s.flags[o.requires] ? 'Сначала выполните связанную задачу' : null,
          cost: o.dialogue ? 0 : 1,
        })
      );
    actions.push(a('overview', 'К делам вагона'));
  }
  for (const p of active)
    if (!s.pendingInspection || s.pendingInspection.includes(p.id))
      actions.push(a('focus', definition(c, p).title, { incidentId: p.id }));
  if (s.pendingInspection) actions.push(a('continue', 'Закончить осмотр без решения', { cost: 1 }));
  else {
    actions.push(
      a('inspect', 'Осмотреть вагон', { zoneId: 'carriage', actionId: 'inspect', cost: 1 })
    );
    for (const t of s.tasks.filter((t) => t.status === 'open')) {
      const d = c.tasks[t.templateId],
        available = !d.requires || !!s.flags[d.requires];
      actions.push(
        a('task', t.label, {
          taskId: t.id,
          cost: 1,
          available,
          unavailableReason: available ? null : 'Сначала выполните уборку',
        })
      );
    }
  }
  actions.push(a('abort', 'Прервать смену'));
  return actions;
}
export function reduceDesignShift(state, command, c, now, requestId = null) {
  if (command.type === '_timeout') return expireDesignShift(state, c, now);
  const fields = {
    begin: [],
    abort: [],
    overview: [],
    continue: [],
    inspect: ['zoneId', 'actionId'],
    focus: ['incidentId'],
    choose: ['incidentId', 'sceneId', 'actionId', 'windowId'],
    task: ['taskId'],
  };
  const offered = designActions(state, c).find(
    (a) =>
      a.command === command.type &&
      a.available !== false &&
      (fields[command.type] || []).every((k) => (a[k] ?? null) === (command[k] ?? null))
  );
  assertV2(offered, 'ACTION_NOT_AVAILABLE', 'Действие сейчас недоступно.', 409);
  const s = clone(state);
  s.revision++;
  s.updatedAt = now;
  s.lastObservedServerAt = now;
  if (command.type === 'abort') {
    finish(s, c, now, 'aborted');
    return s;
  }
  if (command.type === 'begin') {
    s.phase = 'overview';
    publish(s, c, now);
    log(
      s,
      'begin',
      'Начало смены',
      'Вы в вагоне 3. Приёмка и обслуживание доступны в задачах.',
      now
    );
  }
  if (command.type === 'overview') {
    s.phase = 'overview';
    s.focusIncidentId = null;
  }
  if (command.type === 'focus') {
    const p = s.problems.find((p) => p.id === command.incidentId);
    s.focusIncidentId = p.id;
    s.phase = 'scene';
    if (p.startedAt === null) p.startedAt = now;
    if (definition(c, p).category === 'critical' && !s.criticalWindow)
      s.criticalWindow = {
        id: p.id + '-window',
        incidentId: p.id,
        status: 'open',
        openedAt: now,
        deadline: s.timingPolicy.durationMs === null ? null : now + s.timingPolicy.durationMs,
      };
  }
  if (command.type === 'choose') {
    const p = s.problems.find((p) => p.id === command.incidentId),
      o = choices(s, c, p).find((o) => o.id === command.actionId);
    p.choice = o.label;
    if (o.dialogue) {
      p.node = o.dialogue;
      log(s, 'dialogue', definition(c, p).title, o.text, now, {
        incidentId: p.id,
        choice: o.label,
      });
    } else {
      outcome(s, c, p, o, now);
      s.decisionCount++;
      s.phase = 'overview';
      s.focusIncidentId = null;
      advance(s, c, now);
    }
  }
  if (command.type === 'task') {
    const t = s.tasks.find((t) => t.id === command.taskId);
    taskOutcome(s, c, t, now, true);
    s.phase = 'overview';
    s.focusIncidentId = null;
    advance(s, c, now);
  }
  if (command.type === 'inspect') {
    const found = s.problems
      .filter((p) => p.status === 'active' && !p.revealed)
      .sort((x, y) => x.appearanceOrder - y.appearanceOrder);
    for (const p of found) {
      p.revealed = true;
      p.knownOrder = ++s.knownCounter;
      log(s, 'discovered', definition(c, p).title, template(definition(c, p).text, p), now, {
        incidentId: p.id,
        seat: p.seat,
      });
    }
    log(
      s,
      'inspection',
      'Осмотр вагона',
      found.length
        ? `Найдено обращений: ${found.length}. Одно можно решить в рамках осмотра.`
        : 'Осмотр завершён. Новых проблем не обнаружено.',
      now
    );
    s.phase = 'overview';
    s.focusIncidentId = null;
    if (found.length) s.pendingInspection = found.map((p) => p.id);
    else advance(s, c, now);
  }
  if (command.type === 'continue') {
    s.phase = 'overview';
    s.focusIncidentId = null;
    advance(s, c, now);
  }
  return s;
}
export function expireDesignShift(state, c, now) {
  const w = state.criticalWindow;
  if (!w || w.deadline === null || now < w.deadline || state.phase === 'result') return state;
  const s = clone(state);
  s.revision++;
  s.lastObservedServerAt = now;
  s.updatedAt = now;
  const p = s.problems.find((p) => p.id === w.incidentId);
  outcome(s, c, p, definition(c, p).worst, now, 'timeout');
  advance(s, c, now);
  return s;
}
export function publicDesignShift(s, c, now) {
  const p = s.problems.find((p) => p.id === s.focusIncidentId),
    d = p && definition(c, p),
    node = p && p.node !== 'start' ? d.dialogue[p.node] : d;
  const known = s.problems.filter((p) => p.revealed).sort((a, b) => a.knownOrder - b.knownOrder);
  const visibleLog = s.log.filter(
    (e) =>
      !e.hidden ||
      s.result ||
      s.problems.find((p) => p.id === e.incidentId)?.revealed ||
      s.problems.find((p) => p.id === e.incidentId)?.status === 'resolved'
  );
  return {
    schemaVersion: 2,
    engineVersion: s.engineVersion,
    id: s.id,
    phase: s.phase,
    status: s.status,
    revision: s.revision,
    serverNow: now,
    context: s.context,
    mode: s.mode,
    variantId: s.variantId,
    step: s.step,
    totalTurns: s.totalTurns,
    scales: s.scales,
    focusIncidentId: s.focusIncidentId,
    criticalWindow: s.criticalWindow,
    timingPolicy: s.timingPolicy,
    pendingInspection: s.pendingInspection,
    actions: designActions(s, c),
    scene: node
      ? {
          id: p.node,
          title: d.title,
          speaker: node.speaker,
          text: template(node.text, p),
          seat: p.seat,
          zone: d.zone,
        }
      : null,
    incidents: known.map((p) => ({
      id: p.id,
      label: definition(c, p).title,
      text: template(definition(c, p).text, p),
      seat: p.seat,
      zone: definition(c, p).zone,
      status: p.status === 'active' ? 'open' : p.points === 0 ? 'failed' : 'resolved',
    })),
    tasks: s.tasks.map((t) => ({
      id: t.id,
      label: t.label,
      text: c.tasks[t.templateId].text,
      seat: t.seat,
      status: t.status,
      parentId: t.parentId,
    })),
    passengers: s.passengers.map((p) => ({ seat: p.seat, loyalty: p.loyalty })),
    log: visibleLog.map((e) => ({
      seq: e.seq,
      type: e.type,
      turn: e.turn,
      title: e.title,
      text: e.text,
      seat: e.seat,
      impact: e.impact,
      points: e.points,
      causeEventId: e.causeEventId,
      eventId: e.eventId,
    })),
    result: s.result,
  };
}
