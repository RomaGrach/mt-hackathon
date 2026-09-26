// One outstanding, exact, server-idempotent game command per tab. No profile PII is stored.
export const PENDING_KEY = 'reis400.pending-command.v1';
export function isUncertain(error) {
  return (
    ['NETWORK', 'TIMEOUT', 'INVALID_RESPONSE'].includes(error?.code) ||
    error?.status >= 500 ||
    [408, 429].includes(error?.status)
  );
}
export function readPending(storage = globalThis.sessionStorage, key = PENDING_KEY) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const item = JSON.parse(raw);
    if (
      !/^\/(?:v2\/)?runs(?:\/[a-zA-Z0-9-]+(?:\/(?:decision|continue|abort|replay|commands))?)?$/.test(
        item.path
      ) ||
      !/^[a-zA-Z0-9-]{8,64}$/.test(item.body?.requestId)
    )
      throw new Error('Invalid pending command');
    return item;
  } catch {
    // Never transmit corrupted or foreign storage data. Initial GET reconciles server state.
    try {
      storage.removeItem(key);
    } catch {
      /* Storage can be disabled. */
    }
    return null;
  }
}
export function savePending(command, storage = globalThis.sessionStorage, key = PENDING_KEY) {
  try {
    storage.setItem(key, JSON.stringify(command));
  } catch {
    const error = new Error(
      'Не удалось сохранить запрос в этой вкладке. Разрешите хранилище браузера и повторите. Действие ещё не отправлено.'
    );
    error.code = 'STORAGE_UNAVAILABLE';
    throw error;
  }
}
export function clearPending(storage = globalThis.sessionStorage, key = PENDING_KEY) {
  try {
    storage.removeItem(key);
  } catch {
    /* A future GET remains authoritative. */
  }
}
