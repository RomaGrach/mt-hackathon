import { getScenario } from './scenarios.js';

const clamp = (value) => Math.max(0, Math.min(100, value));

export function createRun(scenarioId) {
  const scenario = getScenario(scenarioId);
  if (!scenario) throw new Error('Неизвестный сценарий');
  return { scenarioId, scenarioVersion: scenario.version, nodeId: scenario.start, loyalty: 70, safety: 75, points: 0,
    competencies: { empathy: 0, protocol: 0, speed: 0 }, history: [], criticalError: false, finished: false };
}

export function getNode(run) {
  const node = getScenario(run.scenarioId)?.nodes[run.nodeId];
  if (!node) throw new Error('Сцена не найдена');
  return node;
}

export function makeDecision(run, optionId, secondsLeft = null) {
  if (run.finished) throw new Error('Сценарий уже завершён');
  const node = getNode(run);
  if (node.kind !== 'decision') throw new Error('Решение сейчас недоступно');
  const timedOut = optionId === null || Boolean(node.timer && secondsLeft !== null && secondsLeft <= 0);
  const choice = timedOut ? node.timeout : node.options.find((option) => option.id === optionId);
  if (!choice) throw new Error('Вариант не найден');
  const nextNode = getScenario(run.scenarioId).nodes[choice.next];
  if (!nextNode) throw new Error('Следующая сцена не найдена');
  const recommended = node.options.find((option) => option.recommended);
  const competencies = { ...run.competencies };
  for (const [key, value] of Object.entries(choice.competencies ?? {})) competencies[key] = (competencies[key] ?? 0) + value;
  return {
    ...run, nodeId: choice.next,
    loyalty: clamp(run.loyalty + (choice.impact.loyalty ?? 0)),
    safety: clamp(run.safety + (choice.impact.safety ?? 0)),
    points: Math.max(0, run.points + (choice.impact.points ?? 0)),
    competencies, criticalError: run.criticalError || Boolean(choice.critical),
    history: [...run.history, { nodeId: run.nodeId, choiceId: choice.id, title: choice.title, feedback: choice.feedback,
      impact: choice.impact, timedOut, secondsLeft, critical: Boolean(choice.critical),
      alternative: recommended && recommended.id !== choice.id ? { title: recommended.title, description: recommended.description, feedback: recommended.feedback } : null }],
    finished: nextNode.kind === 'ending'
  };
}

export function summarizeRun(run) {
  if (!run.finished) throw new Error('Сценарий ещё не завершён');
  const grade = run.criticalError ? 'Нужна практика' : run.safety >= 85 && run.loyalty >= 75 && run.points >= 200 ? 'Отлично'
    : run.safety >= 65 && run.loyalty >= 55 ? 'Хорошо' : 'Нужна практика';
  return { scenarioId: run.scenarioId, scenarioVersion: run.scenarioVersion, points: run.points, loyalty: run.loyalty,
    safety: run.safety, criticalError: run.criticalError, passed: grade !== 'Нужна практика',
    grade, competencies: { ...run.competencies }, history: [...run.history] };
}

export function rewindToDecision(run, index) {
  if (!run.finished || !Number.isInteger(index) || index < 0 || index >= run.history.length) throw new Error('Развилка не найдена');
  let replay = createRun(run.scenarioId);
  for (const entry of run.history.slice(0, index)) {
    replay = makeDecision(replay, entry.timedOut ? null : entry.choiceId, entry.secondsLeft);
  }
  return replay;
}
