import { GameError } from './engine.js';
export const assertV2 = (ok, code, message, status = 400) => {
  if (!ok) throw new GameError(code, message, status);
};
export function objectFields(body, keys, required = keys) {
  assertV2(
    body &&
      typeof body === 'object' &&
      !Array.isArray(body) &&
      Object.keys(body).every((k) => keys.includes(k)) &&
      required.every((k) => Object.hasOwn(body, k)),
    'INVALID_BODY',
    'Некорректные или неизвестные поля запроса.'
  );
}
export function requestKey(id) {
  assertV2(
    typeof id === 'string' && /^[a-zA-Z0-9-]{8,64}$/.test(id),
    'INVALID_REQUEST_ID',
    'Нужен requestId длиной 8–64 символа.'
  );
}
export function validateCommand(command) {
  const fields = {
    begin: [],
    task: ['taskId'],
    continue: [],
    overview: [],
    pause: [],
    resume: [],
    finish: [],
    abort: [],
    wait: [],
    hint: ['hintId'],
    focus: ['incidentId'],
    inspect: ['zoneId', 'actionId'],
    choose: ['incidentId', 'sceneId', 'actionId', 'windowId'],
  };
  assertV2(
    command && Object.hasOwn(fields, command.type),
    'INVALID_COMMAND',
    'Неизвестная команда.'
  );
  objectFields(command, ['type', ...fields[command.type]]);
  for (const k of fields[command.type])
    assertV2(
      (command.type === 'choose' &&
        ['incidentId', 'windowId'].includes(k) &&
        command[k] === null) ||
        (typeof command[k] === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(command[k])),
      'INVALID_COMMAND',
      'Некорректный идентификатор действия.'
    );
}
