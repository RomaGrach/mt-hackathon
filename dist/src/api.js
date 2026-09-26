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
export const requestId = () => crypto.randomUUID();
