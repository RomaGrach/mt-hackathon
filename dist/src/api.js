export class ApiError extends Error {
  constructor(message, code, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
export async function api(path, { method = 'GET', body, retry = true } = {}) {
  const request = { method, credentials: 'same-origin', headers: { 'X-Reis-Client': 'web' } };
  if (body !== undefined) {
    request.headers['Content-Type'] = 'application/json';
    request.body = JSON.stringify(body);
  }
  const attempts = retry ? 2 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch('/api' + path, {
        ...request,
        signal: AbortSignal.timeout(12000),
      });
      let data;
      try {
        data = await response.json();
      } catch {
        throw new ApiError('Сервер вернул некорректный ответ', 'INVALID_RESPONSE', response.status);
      }
      if (!response.ok)
        throw new ApiError(
          data.error?.message || 'Запрос не выполнен',
          data.error?.code || 'HTTP_ERROR',
          response.status
        );
      return data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      // Retry the exact same body/requestId. A lost response must not mean a second decision.
      if (attempt + 1 === attempts)
        throw new ApiError(
          'Нет связи с сервером. Решение могло сохраниться. Обновите состояние; таймер на сервере продолжает идти.',
          'NETWORK',
          0
        );
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
}
export const requestId = () => crypto.randomUUID();
