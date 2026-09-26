// Same-origin Sites frontend. The game engine and persistent SQLite remain on the Node service.
const assets = __STATIC_ASSETS__;
const security = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'content-security-policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      if (!env.API_UPSTREAM_ORIGIN || !env.PROXY_SHARED_SECRET)
        return new Response(
          JSON.stringify({
            error: { code: 'API_UNAVAILABLE', message: 'Сервер игры пока недоступен.' },
          }),
          {
            status: 503,
            headers: {
              ...security,
              'content-type': 'application/json; charset=utf-8',
              'cache-control': 'no-store',
            },
          }
        );
      let target;
      try {
        target = new URL(env.API_UPSTREAM_ORIGIN);
        if (
          target.protocol !== 'https:' ||
          target.pathname !== '/' ||
          target.search ||
          target.hash ||
          target.username ||
          target.password
        )
          throw new Error('Invalid API origin');
      } catch {
        return new Response('API configuration error', { status: 503, headers: security });
      }
      target.pathname = url.pathname;
      target.search = url.search;
      const headers = new Headers(request.headers);
      headers.delete('host');
      headers.delete('x-reis-proxy-secret');
      headers.delete('x-reis-visitor');
      headers.set('x-reis-proxy-secret', env.PROXY_SHARED_SECRET);
      headers.set('x-reis-visitor', request.headers.get('cf-connecting-ip') || 'unknown');
      try {
        const upstream = await fetch(target, {
          method: request.method,
          headers,
          body: request.body,
          redirect: 'manual',
        });
        const responseHeaders = new Headers(upstream.headers);
        for (const [key, value] of Object.entries(security)) responseHeaders.set(key, value);
        responseHeaders.set('cache-control', 'no-store');
        return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
      } catch {
        return new Response(
          JSON.stringify({
            error: { code: 'API_UNAVAILABLE', message: 'Сервер игры пока недоступен.' },
          }),
          {
            status: 503,
            headers: {
              ...security,
              'content-type': 'application/json; charset=utf-8',
              'cache-control': 'no-store',
            },
          }
        );
      }
    }
    if (!['GET', 'HEAD'].includes(request.method))
      return new Response(null, { status: 405, headers: security });
    const path = url.pathname === '/index.html' ? '/' : url.pathname;
    if (!(path in assets)) return new Response('Not found', { status: 404, headers: security });
    const type = path.endsWith('.js')
      ? 'text/javascript'
      : path.endsWith('.css')
        ? 'text/css'
        : 'text/html';
    return new Response(request.method === 'HEAD' ? null : assets[path], {
      headers: {
        ...security,
        'content-type': type + '; charset=utf-8',
        'cache-control': 'public, max-age=300',
      },
    });
  },
};
