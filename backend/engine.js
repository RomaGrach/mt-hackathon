/** Pure, server-authoritative scenario engine. Time is injected for deterministic tests. */
export const SKILLS = ['empathy', 'protocol', 'speed', 'teamwork'];
export class GameError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
const fail = (message) => {
  throw new GameError('INVALID_SCENARIO', message);
};
const clamp = (n) => Math.max(0, Math.min(100, n));
const emptySkills = () => Object.fromEntries(SKILLS.map((key) => [key, 0]));
const plain = (v) => v && typeof v === 'object' && !Array.isArray(v);

export function matches(state, when = {}) {
  return (
    (!when.minSafety || state.safety >= when.minSafety) &&
    (!when.minLoyalty || state.loyalty >= when.minLoyalty) &&
    Object.entries(when.flags || {}).every(([key, value]) => Boolean(state.flags[key]) === value) &&
    Object.entries(when.resources || {}).every(
      ([key, value]) => (state.resources[key] || 0) >= value
    )
  );
}
export function available(state, option) {
  return (
    matches(state, option.when) &&
    Object.entries(option.spend || {}).every(([key, n]) => (state.resources[key] || 0) >= n)
  );
}

/** Reject broken links, cycles, impossible types and unreachable content before publication. */
export function validateScenario(scenario) {
  if (
    !plain(scenario) ||
    !/^[a-z][a-z0-9-]{0,49}$/.test(scenario.id || '') ||
    !scenario.version ||
    !scenario.title
  )
    fail('Нужны id, version и title');
  if (!plain(scenario.nodes) || !scenario.nodes[scenario.start]) fail('Нет стартовой сцены');
  if (Object.keys(scenario.nodes).length > 100) fail('Слишком много сцен');
  const validateWhen = (when) => {
    if (when === undefined) return;
    if (
      !plain(when) ||
      Object.keys(when).some((k) => !['minSafety', 'minLoyalty', 'flags', 'resources'].includes(k))
    )
      fail('Некорректное условие');
    for (const key of ['minSafety', 'minLoyalty'])
      if (
        when[key] !== undefined &&
        (!Number.isFinite(when[key]) || when[key] < 0 || when[key] > 100)
      )
        fail('Некорректный порог');
    if (
      when.flags &&
      (!plain(when.flags) || Object.values(when.flags).some((v) => typeof v !== 'boolean'))
    )
      fail('Флаги должны быть boolean');
    if (
      when.resources &&
      (!plain(when.resources) ||
        Object.values(when.resources).some((v) => !Number.isInteger(v) || v < 0))
    )
      fail('Некорректные ресурсы');
  };
  for (const [id, node] of Object.entries(scenario.nodes)) {
    if (node.kind === 'ending') {
      if (!node.title || !node.text) fail('Пустой исход: ' + id);
      continue;
    }
    if (
      node.kind !== 'decision' ||
      !node.text ||
      !node.prompt ||
      !Array.isArray(node.options) ||
      node.options.length < 2
    )
      fail('Неполная сцена: ' + id);
    if (
      node.timer !== undefined &&
      (!Number.isInteger(node.timer) || node.timer < 1 || node.timer > 300 || !node.timeout)
    )
      fail('Таймеру нужен корректный исход');
    if (node.timeout && !node.timer) fail('Таймаут без таймера');
    const ids = new Set();
    for (const choice of [...node.options, ...(node.timeout ? [node.timeout] : [])]) {
      if (
        !choice.id ||
        ids.has(choice.id) ||
        !choice.title ||
        !choice.feedback ||
        !scenario.nodes[choice.next]
      )
        fail('Некорректный вариант в ' + id);
      ids.add(choice.id);
      if (!plain(choice.impact)) fail('Нет влияния на показатели');
      for (const [key, value] of Object.entries(choice.impact)) {
        if (
          !['loyalty', 'safety', 'points'].includes(key) ||
          !Number.isFinite(value) ||
          Math.abs(value) > (key === 'points' ? 200 : 100)
        )
          fail('Некорректная шкала');
      }
      for (const [key, value] of Object.entries(choice.competencies || {}))
        if (!SKILLS.includes(key) || !Number.isFinite(value) || value < 0 || value > 3)
          fail('Некорректная компетенция');
      validateWhen(choice.when);
      if (
        choice.set &&
        (!plain(choice.set) || Object.values(choice.set).some((v) => typeof v !== 'boolean'))
      )
        fail('Некорректная установка флага');
      for (const [key, value] of Object.entries(choice.spend || {}))
        if (!(key in (scenario.resources || {})) || !Number.isInteger(value) || value < 1)
          fail('Некорректный расход ресурса');
      for (const branch of choice.branches || []) {
        validateWhen(branch.when);
        if (!scenario.nodes[branch.next]) fail('Развилка ведёт в пустоту');
      }
    }
    if (!node.options.some((o) => !o.when && !o.spend))
      fail('Нужен хотя бы один безусловный вариант');
  }
  const visited = new Set();
  const stack = new Set();
  function visit(id) {
    if (stack.has(id)) fail('Цикл сценария: ' + id);
    if (visited.has(id)) return;
    stack.add(id);
    const node = scenario.nodes[id];
    for (const choice of [...(node.options || []), ...(node.timeout ? [node.timeout] : [])]) {
      visit(choice.next);
      for (const branch of choice.branches || []) visit(branch.next);
    }
    stack.delete(id);
    visited.add(id);
  }
  visit(scenario.start);
  if (visited.size !== Object.keys(scenario.nodes).length) fail('Есть недостижимые сцены');
  return scenario;
}

export function createState(scenario, now, practice = false) {
  return {
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    nodeId: scenario.start,
    loyalty: 70,
    safety: 75,
    points: 0,
    competencies: emptySkills(),
    flags: {},
    resources: { ...(scenario.resources || {}) },
    history: [],
    criticalError: false,
    finished: false,
    phase: 'decision',
    revision: 0,
    practice,
    startedAt: now,
    enteredAt: now,
    deadline: scenario.nodes[scenario.start].timer
      ? now + scenario.nodes[scenario.start].timer * 1000
      : null,
  };
}

export function decide(state, scenario, optionId, now) {
  if (state.phase !== 'decision' || state.finished)
    throw new GameError('WRONG_PHASE', 'Решение сейчас недоступно', 409);
  const node = scenario.nodes[state.nodeId];
  const timedOut = state.deadline !== null && now >= state.deadline;
  if (optionId === null && !timedOut)
    throw new GameError('TIMER_RUNNING', 'Время ещё не истекло', 409);
  const choice = timedOut ? node.timeout : node.options.find((o) => o.id === optionId);
  if (!choice) throw new GameError('INVALID_CHOICE', 'Такого действия нет в этой сцене');
  if (!timedOut && !available(state, choice))
    throw new GameError(
      'LOCKED_CHOICE',
      choice.requirement || 'Условия действия не выполнены',
      409
    );
  const resources = { ...state.resources };
  for (const [key, value] of Object.entries(choice.spend || {})) resources[key] -= value;
  const next = {
    ...state,
    resources,
    flags: { ...state.flags, ...choice.set },
    loyalty: clamp(state.loyalty + (choice.impact.loyalty || 0)),
    safety: clamp(state.safety + (choice.impact.safety || 0)),
    points: Math.max(0, state.points + (choice.impact.points || 0)),
    competencies: { ...state.competencies },
    criticalError: state.criticalError || Boolean(choice.critical),
    revision: state.revision + 1,
    phase: 'feedback',
    deadline: null,
  };
  const possible = emptySkills();
  for (const option of node.options.filter((o) => available(state, o)))
    for (const key of SKILLS)
      possible[key] = Math.max(possible[key], option.competencies?.[key] || 0);
  const earned = { ...emptySkills(), ...choice.competencies };
  const responseMs = Math.max(
    0,
    Math.min(now - state.enteredAt, node.timer ? node.timer * 1000 : 86400000)
  );
  if (node.timer && responseMs > node.timer * 500) earned.speed *= 0.5;
  for (const key of SKILLS) next.competencies[key] += earned[key];
  // Threshold branches see post-decision scales/flags. Loyalty cannot cancel a critical error.
  next.nodeId = choice.branches?.find((b) => matches(next, b.when))?.next || choice.next;
  next.finished = scenario.nodes[next.nodeId].kind === 'ending';
  if (next.finished) next.finishedAt = now;
  const recommended = node.options.find((o) => o.recommended && available(state, o));
  next.history = [
    ...state.history,
    {
      nodeId: state.nodeId,
      scene: node.text,
      choiceId: choice.id,
      title: choice.title,
      feedback: choice.feedback,
      timedOut,
      critical: Boolean(choice.critical),
      responseMs,
      timed: Boolean(node.timer),
      at: now,
      before: { loyalty: state.loyalty, safety: state.safety },
      after: { loyalty: next.loyalty, safety: next.safety },
      impact: {
        loyalty: next.loyalty - state.loyalty,
        safety: next.safety - state.safety,
        points: next.points - state.points,
      },
      earned,
      possible,
      alternative:
        recommended && recommended.id !== choice.id
          ? { title: recommended.title, feedback: recommended.feedback }
          : null,
    },
  ];
  return next;
}

export function advance(state, scenario, now) {
  if (state.phase !== 'feedback')
    throw new GameError('WRONG_PHASE', 'Сначала примите решение', 409);
  const node = scenario.nodes[state.nodeId];
  return {
    ...state,
    phase: state.finished ? 'result' : 'decision',
    revision: state.revision + 1,
    enteredAt: now,
    deadline: !state.finished && node.timer ? now + node.timer * 1000 : null,
  };
}

export function summarize(state, scenario) {
  if (!state.finished) throw new GameError('NOT_FINISHED', 'Сценарий ещё не завершён', 409);
  const passed =
    !state.aborted && !state.criticalError && state.safety >= 65 && state.loyalty >= 55;
  return {
    scenarioId: state.scenarioId,
    scenarioVersion: state.scenarioVersion,
    title: scenario.title,
    points: state.points,
    safety: state.safety,
    loyalty: state.loyalty,
    criticalError: state.criticalError,
    passed,
    grade: !passed
      ? 'Нужна практика'
      : state.safety >= 85 && state.loyalty >= 80
        ? 'Отлично'
        : 'Хорошо',
    practice: state.practice,
    competencies: state.competencies,
    history: state.history,
    ending: state.aborted
      ? {
          kind: 'ending',
          title: 'Попытка прервана',
          text: 'Прогресс этой попытки сохранён для разбора, но зачёт не получен.',
        }
      : scenario.nodes[state.nodeId],
    completedAt: new Date(state.finishedAt).toISOString(),
  };
}

export function rewind(state, scenario, index, now) {
  if (!state.finished || !Number.isInteger(index) || index < 0 || index >= state.history.length)
    throw new GameError('INVALID_REWIND', 'Недоступная развилка');
  let replay = createState(scenario, now, true);
  for (const entry of state.history.slice(0, index)) {
    replay = decide(
      replay,
      scenario,
      entry.timedOut ? null : entry.choiceId,
      replay.enteredAt + entry.responseMs
    );
    replay = advance(replay, scenario, now);
  }
  return { ...replay, revision: 0, startedAt: now };
}

/** Do not disclose answer keys, future scenes, scoring rules or hidden transitions to the client. */
export function publicState(state, scenario, id, now) {
  const node = scenario.nodes[state.nodeId];
  const options = (node.options || []).map((o) => ({
    id: o.id,
    title: o.title,
    description: o.description || '',
    available: available(state, o),
    requirement: o.requirement || 'Нужна предварительная подготовка',
  }));
  return {
    id,
    ...state,
    flags: undefined,
    node: {
      kind: node.kind,
      speaker: node.speaker,
      label: node.label,
      text: node.text,
      prompt: node.prompt,
      title: node.title,
      timer: node.timer,
      options,
    },
    scenario: {
      id: scenario.id,
      title: scenario.title,
      category: scenario.category,
      icon: scenario.icon,
      number: scenario.number,
      accent: scenario.accent,
      skills: scenario.skills,
      carriage: scenario.carriage,
      objective: scenario.objective,
    },
    result: state.finished ? summarize(state, scenario) : null,
    serverNow: now,
  };
}

export function abort(state, now) {
  if (state.finished) throw new GameError('ALREADY_FINISHED', 'Попытка уже завершена', 409);
  return {
    ...state,
    aborted: true,
    finished: true,
    finishedAt: now,
    phase: 'result',
    deadline: null,
    revision: state.revision + 1,
  };
}
