import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash, timingSafeEqual } from 'node:crypto';
import { GameError } from './engine.js';
import { Store } from './storage.js';
import { Service } from './service.js';
import { siteAdminAccess, adminUsers } from './admin.js';

const PUBLIC = new Map([
  ['/src/design002-view.js', ['src/design002-view.js', 'text/javascript']],
  ['/', ['index.html', 'text/html']],
  ['/index.html', ['index.html', 'text/html']],
  ['/styles.css', ['styles.css', 'text/css']],
  ['/preview.html', ['preview.html', 'text/html']],
  ['/src/ui.js', ['src/ui.js', 'text/javascript']],
  ['/src/ux.js', ['src/ux.js', 'text/javascript']],
  ['/src/course.js', ['src/course.js', 'text/javascript']],
  ['/src/wagon-view.js', ['src/wagon-view.js', 'text/javascript']],
  ['/src/recovery.js', ['src/recovery.js', 'text/javascript']],
  ['/src/shift-view.js', ['src/shift-view.js', 'text/javascript']],
  ['/src/prototype-shift-view.js', ['src/prototype-shift-view.js', 'text/javascript']],
  ['/src/shift-client.js', ['src/shift-client.js', 'text/javascript']],
  ['/src/preview-state.js', ['src/preview-state.js', 'text/javascript']],
  ['/src/preview-app.js', ['src/preview-app.js', 'text/javascript']],
  ['/src/motivation-view.js', ['src/motivation-view.js', 'text/javascript']],
  ['/src/admin-view.js', ['src/admin-view.js', 'text/javascript']],
  ['/src/app.js', ['src/app.js', 'text/javascript']],
  ['/src/api.js', ['src/api.js', 'text/javascript']],
  ['/src/views.js', ['src/views.js', 'text/javascript']],
  ['/api/openapi.json', ['docs/openapi.json', 'application/json']],
]);
const error = (code, message, status = 400) => {
  throw new GameError(code, message, status);
};
const digest = (s) => createHash('sha256').update(s).digest();
const cookieValue = (req) =>
  (req.headers.cookie || '')
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('reis_session='))
    ?.slice(13);
const shape = (body, keys) => {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some((k) => !keys.includes(k))
  )
    error('INVALID_BODY', 'Неизвестные поля запроса');
};
const integer = (value, fallback, max = Number.MAX_SAFE_INTEGER) => {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max)
    error('INVALID_QUERY', 'Некорректный числовой параметр');
  return Number(value);
};
async function jsonBody(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json'))
    error('CONTENT_TYPE', 'Используйте application/json', 415);
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16384) error('BODY_TOO_LARGE', 'Запрос превышает 16 КБ', 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    error('INVALID_JSON', 'Не удалось прочитать JSON');
  }
}

/** A bounded, per-process abuse limiter. Production multi-replica mode needs a shared adapter. */
class Limiter {
  constructor(limit, windowMs) {
    this.limit = limit;
    this.window = windowMs;
    this.entries = new Map();
  }
  check(key, now) {
    if (this.entries.size > 10000) {
      for (const [k, v] of this.entries) if (v.until <= now) this.entries.delete(k);
      if (this.entries.size > 10000 && !this.entries.has(key))
        error('RATE_LIMIT', 'Сервер занят, повторите позднее', 429);
    }
    let v = this.entries.get(key);
    if (!v || v.until <= now) {
      v = { count: 0, until: now + this.window };
      this.entries.set(key, v);
    }
    if (++v.count > this.limit)
      error('RATE_LIMIT', 'Слишком много запросов. Повторите позднее.', 429);
  }
}

export function createApp({
  database = process.env.DB_PATH || 'data/reis400.sqlite',
  store = new Store(database),
  clock = Date.now,
  integrationKey = process.env.HR_API_KEY || '',
  publicOrigin = process.env.PUBLIC_ORIGIN || '',
  secureCookie = process.env.COOKIE_SECURE === 'true',
  rateLimit = 240,
  sessionLimit = 15,
  sweep = true,
  clockMode = 'elapsed',
  backfillLegacy = true,
  publishContent = true,
} = {}) {
  if (integrationKey && integrationKey.length < 32)
    throw new Error('HR_API_KEY должен содержать минимум 32 символа');
  if (publicOrigin && !/^https?:\/\/[^/]+$/.test(publicOrigin))
    throw new Error('PUBLIC_ORIGIN — origin без пути и завершающего /');
  if (
    process.env.NODE_ENV === 'production' &&
    (!secureCookie || !publicOrigin.startsWith('https://'))
  )
    throw new Error('Production требует HTTPS PUBLIC_ORIGIN и COOKIE_SECURE=true');
  const service = new Service(store, { clock, clockMode, backfillLegacy, publishContent });
  const requests = new Limiter(rateLimit, 60000);
  const registrations = new Limiter(sessionLimit, 3600000);
  const send = (res, status, value) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(value));
  };
  const cookie = (res, value, maxAge) =>
    res.setHeader(
      'Set-Cookie',
      'reis_session=' +
        value +
        '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' +
        maxAge +
        (secureCookie ? '; Secure' : '')
    );
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
    );
    try {
      const url = new URL(req.url, 'http://localhost');
      let pathname;
      try {
        pathname = decodeURIComponent(url.pathname);
      } catch {
        error('INVALID_PATH', 'Некорректный адрес');
      }
      const method = req.method;
      if ((method === 'GET' || method === 'HEAD') && PUBLIC.has(pathname)) {
        const [file, type] = PUBLIC.get(pathname);
        const data = await readFile(resolve(fileURLToPath(new URL('../', import.meta.url)), file));
        res.writeHead(200, { 'Content-Type': type + '; charset=utf-8' });
        res.end(method === 'HEAD' ? undefined : data);
        return;
      }
      if (pathname === '/favicon.ico') {
        res.writeHead(204).end();
        return;
      }
      if (!pathname.startsWith('/api/')) error('NOT_FOUND', 'Ресурс не найден', 404);
      if (pathname === '/api/health' && method === 'GET') {
        store.get('SELECT 1');
        send(res, 200, { status: 'ok', version: '4.0.0', engine: 'shift-4', storage: 'sqlite' });
        return;
      }
      if (pathname.startsWith('/api/admin/')) {
        if (method !== 'GET') error('METHOD_NOT_ALLOWED', 'Сводка доступна только для чтения', 405);
        if (pathname === '/api/admin/access') send(res, 200, siteAdminAccess());
        else if (pathname === '/api/admin/users')
          send(
            res,
            200,
            adminUsers(store, new URL(req.url, 'http://localhost').searchParams, clock())
          );
        else error('NOT_FOUND', 'Ресурс не найден', 404);
        return;
      }
      const client = req.socket.remoteAddress || 'unknown'; // Not persisted or logged.
      requests.check(client, clock());
      if (pathname.startsWith('/api/integrations/')) {
        if (!integrationKey)
          error('INTEGRATION_DISABLED', 'Интеграционный доступ не настроен', 503);
        const supplied = req.headers.authorization?.replace(/^Bearer /, '') || '';
        if (supplied.length > 1024 || !timingSafeEqual(digest(supplied), digest(integrationKey)))
          error('UNAUTHORIZED', 'Недопустимый интеграционный ключ', 401);
        if (method !== 'GET')
          error('METHOD_NOT_ALLOWED', 'Интеграционный API только для чтения', 405);
        const limit = integer(url.searchParams.get('limit'), 100, 200);
        if (limit < 1) error('INVALID_QUERY', 'limit должен быть от 1 до 200');
        if (pathname === '/api/integrations/v1/results') {
          send(
            res,
            200,
            service.integrationResults(integer(url.searchParams.get('cursor'), 0), limit)
          );
          return;
        }
        if (pathname === '/api/integrations/v1/profiles') {
          const cursor = url.searchParams.get('cursor') || '';
          if (cursor.length > 36 || !/^[a-f0-9-]*$/.test(cursor))
            error('INVALID_QUERY', 'Некорректный cursor');
          send(res, 200, service.integrationProfiles(cursor, limit));
          return;
        }
        error('NOT_FOUND', 'Интеграционный ресурс не найден', 404);
      }
      if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method))
        error('METHOD_NOT_ALLOWED', 'Метод не поддерживается', 405);
      if (method !== 'GET') {
        if (req.headers['x-reis-client'] !== 'web')
          error('CSRF', 'Отсутствует защитный заголовок', 403);
        const expected = publicOrigin || 'http://' + req.headers.host;
        if (req.headers.origin && req.headers.origin !== expected)
          error('CSRF', 'Запрос с другого origin запрещён', 403);
        if (req.headers['sec-fetch-site'] === 'cross-site')
          error('CSRF', 'Межсайтовый запрос запрещён', 403);
      }
      if (pathname === '/api/session' && method === 'POST') {
        const body = await jsonBody(req);
        shape(body, ['crew']);
        const existing = service.session(cookieValue(req));
        if (existing) {
          send(res, 200, service.bootstrap(existing));
          return;
        }
        registrations.check(client, clock());
        const session = service.createSession(body.crew);
        cookie(res, session.token, 7 * 86400);
        send(res, 201, service.bootstrap(session.profileId));
        return;
      }
      const token = cookieValue(req);
      const profileId = service.session(token);
      if (!profileId) error('UNAUTHORIZED', 'Создайте учебный профиль для входа', 401);
      if (pathname.startsWith('/api/v2/')) {
        const v2 = service.shifts;
        const reply = (out) => send(res, out.status, out.body);
        if (pathname === '/api/v2/competency/leaderboard' && method === 'GET') {
          send(
            res,
            200,
            v2.competencyLeaders(
              profileId,
              url.searchParams.get('scope') || 'company',
              integer(url.searchParams.get('offset'), 0, 10000),
              integer(url.searchParams.get('limit'), 50, 50)
            )
          );
          return;
        }
        if (pathname === '/api/v2/catalog' && method === 'GET') {
          send(res, 200, { items: v2.catalog() });
          return;
        }
        if (pathname === '/api/v2/motivation' && method === 'GET') {
          send(res, 200, v2.motivationView(profileId));
          return;
        }
        if (pathname === '/api/v2/motivation/preferences' && method === 'POST') {
          reply(v2.preferences(profileId, await jsonBody(req)));
          return;
        }
        if (pathname === '/api/v2/leaderboards' && method === 'GET') {
          send(
            res,
            200,
            v2.leaders(
              profileId,
              url.searchParams.get('scope') || 'crew',
              url.searchParams.get('periodId') || null,
              integer(url.searchParams.get('offset'), 0, 10000),
              integer(url.searchParams.get('limit'), 50, 50)
            )
          );
          return;
        }
        if (pathname === '/api/v2/runs' && method === 'POST') {
          reply(v2.start(profileId, await jsonBody(req)));
          return;
        }
        const entry = pathname.match(/^\/api\/v2\/periods\/(v2-\d{4}-\d{2}-\d{2})\/entry$/);
        if (entry && method === 'POST') {
          reply(v2.entry(profileId, entry[1], await jsonBody(req)));
          return;
        }
        const ack = pathname.match(/^\/api\/v2\/results\/([a-f0-9-]{36})\/debrief-ack$/);
        if (ack && method === 'POST') {
          reply(v2.ack(profileId, ack[1], await jsonBody(req)));
          return;
        }
        const run = pathname.match(
          /^\/api\/v2\/runs\/([a-f0-9-]{36})(?:\/(commands|result|replay))?$/
        );
        if (run) {
          const [, id, action] = run;
          if (method === 'GET' && !action) {
            send(res, 200, v2.get(profileId, id));
            return;
          }
          if (method === 'GET' && action === 'result') {
            send(res, 200, v2.result(profileId, id));
            return;
          }
          if (method === 'GET' && action === 'replay') {
            send(res, 200, v2.exactReplay(profileId, id));
            return;
          }
          if (method === 'POST' && action === 'commands') {
            reply(v2.command(profileId, id, await jsonBody(req)));
            return;
          }
          if (method === 'POST' && action === 'replay') {
            reply(v2.replay(profileId, id, await jsonBody(req)));
            return;
          }
        }
        error('NOT_FOUND', 'API v2 ресурс не найден', 404);
      }
      if (pathname === '/api/bootstrap' && method === 'GET') {
        send(res, 200, service.bootstrap(profileId));
        return;
      }
      if (pathname === '/api/profile/export' && method === 'GET') {
        res.setHeader('Content-Disposition', 'attachment; filename="reis400-profile.json"');
        send(res, 200, service.exportProfile(profileId));
        return;
      }
      if (pathname === '/api/leaderboard' && method === 'GET') {
        send(res, 200, service.leaderboard(profileId, url.searchParams.get('scope') || 'crew'));
        return;
      }
      if (pathname === '/api/profile' && method === 'DELETE') {
        const body = await jsonBody(req);
        shape(body, ['confirm']);
        if (body.confirm !== true) error('CONFIRMATION', 'Нужно подтвердить удаление');
        send(
          res,
          200,
          (() => {
            const value = service.deleteProfile(profileId);
            cookie(res, '', 0);
            return value;
          })()
        );
        return;
      }
      if (pathname === '/api/profile' && method === 'PATCH') {
        const body = await jsonBody(req);
        shape(body, ['crew']);
        send(res, 200, service.updateProfile(profileId, body.crew));
        return;
      }
      if (pathname === '/api/logout' && method === 'POST') {
        const body = await jsonBody(req);
        shape(body, []);
        service.logout(token);
        cookie(res, '', 0);
        send(res, 200, { loggedOut: true });
        return;
      }
      if (pathname === '/api/notices/read' && method === 'POST') {
        const body = await jsonBody(req);
        shape(body, ['ids']);
        send(res, 200, service.markRead(profileId, body.ids));
        return;
      }
      if (pathname === '/api/runs' && method === 'POST') {
        const body = await jsonBody(req);
        shape(body, ['scenarioId', 'practice', 'requestId']);
        send(
          res,
          201,
          service.start(profileId, body.scenarioId, body.practice ?? false, body.requestId)
        );
        return;
      }
      const match = pathname.match(
        /^\/api\/runs\/([a-f0-9-]{36})(?:\/(decision|continue|abort|replay))?$/
      );
      if (match) {
        const [, id, action] = match;
        if (method === 'GET' && !action) {
          send(res, 200, service.getRun(profileId, id));
          return;
        }
        if (method === 'POST' && action) {
          const body = await jsonBody(req);
          if (action === 'replay') {
            shape(body, ['index', 'requestId']);
            send(res, 201, service.replay(profileId, id, body.index, body.requestId));
            return;
          }
          shape(
            body,
            action === 'decision'
              ? ['optionId', 'revision', 'requestId']
              : ['revision', 'requestId']
          );
          send(res, 200, service.act(profileId, id, action, body));
          return;
        }
      }
      error('NOT_FOUND', 'API-ресурс не найден', 404);
    } catch (err) {
      if (res.headersSent || res.destroyed) return;
      const known = err instanceof GameError;
      if (!known) console.error('Internal request error:', err.code || err.name); // No body, identity, IP or secrets.
      if (err.status === 429) res.setHeader('Retry-After', '60');
      send(res, known ? err.status : 500, {
        error: {
          code: known ? err.code : 'INTERNAL',
          message: known ? err.message : 'Сервер не завершил запрос. Повторите позднее.',
        },
      });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  const timers = sweep
    ? [
        setInterval(() => {
          try {
            service.sweep();
          } catch (e) {
            console.error('Timer sweep failed:', e.code || e.name);
          }
        }, 1000),
        setInterval(() => {
          try {
            service.cleanup();
          } catch (e) {
            console.error('Cleanup failed:', e.code || e.name);
          }
        }, 60000),
      ]
    : [];
  timers.forEach((timer) => timer.unref());
  server.on('close', () => {
    timers.forEach(clearInterval);
    store.close();
  });
  return { server, service, store };
}
