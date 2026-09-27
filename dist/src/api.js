import { isUncertain } from './recovery.js';
export class ApiError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}
export async function api(path, { method = 'GET', body, retry = true, timeoutMs = 12000 } = {}) {
  const request = { method, credentials: 'same-origin', headers: { 'X-Reis-Client': 'web' } };
  if (body !== undefined) {
    request.headers['Content-Type'] = 'application/json';
    request.body = JSON.stringify(body);
  }
  // Session creation and non-receipted writes must never be automatically duplicated.
  const attempts = retry && (method === 'GET' || Boolean(body?.requestId)) ? 2 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch('/api' + path, { ...request, signal: controller.signal });
      let data;
      try {
        data = await response.json();
      } catch {
        throw new ApiError(
          'Ответ сервера не удалось прочитать. Обновите состояние; действие могло сохраниться.',
          'INVALID_RESPONSE',
          response.status
        );
      }
      if (!response.ok)
        throw new ApiError(
          data.error?.message || 'Сервер не выполнил запрос. Обновите состояние.',
          data.error?.code || 'HTTP_ERROR',
          response.status
        );
      if (attempt > 0 && data && typeof data === 'object')
        Object.defineProperty(data, '__retried', { value: true });
      return data;
    } catch (cause) {
      const error =
        cause instanceof ApiError
          ? cause
          : new ApiError(
              controller.signal.aborted
                ? 'Сервер не ответил вовремя. Действие могло сохраниться. Обновите состояние; таймер на сервере не остановлен.'
                : 'Нет связи с сервером. Действие могло сохраниться. Обновите состояние; таймер на сервере не остановлен.',
              controller.signal.aborted ? 'TIMEOUT' : 'NETWORK',
              0
            );
      if (attempt + 1 === attempts || !isUncertain(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 400));
    } finally {
      clearTimeout(timer);
    }
  }
}
export const requestId = () => {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
