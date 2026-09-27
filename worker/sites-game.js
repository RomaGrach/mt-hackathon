import initSqlJs from 'sql.js/dist/sql-asm.js';
import { httpServerHandler } from 'cloudflare:node';
import { createApp } from '../backend/http.js';
import { scenarios } from '../backend/catalog.js';
import { SHIFT_CONTENT, contentHash } from '../backend/shift-content.js';
import { SqlJsStore } from './sqljs-store.js';

const assets = __STATIC_ASSETS__;
const sqlReady = initSqlJs();
// Revalidate/re-publish content once per deployed content revision, not on every tap.
const publicationFingerprint = contentHash({ scenarios, shift: SHIFT_CONTENT });
const security = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'content-security-policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
};
const openapi = __OPENAPI__;

async function unpack(image) {
  if (!image) return undefined;
  const bytes = new Uint8Array(image);
  return new Uint8Array(
    await new Response(
      new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
    ).arrayBuffer()
  );
}
async function pack(bytes) {
  return new Uint8Array(
    await new Response(
      new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))
    ).arrayBuffer()
  );
}
function responseForStatic(request, path) {
  if (!['GET', 'HEAD'].includes(request.method))
    return new Response(null, { status: 405, headers: security });
  if (path === '/favicon.ico') return new Response(null, { status: 204, headers: security });
  if (path === '/api/openapi.json')
    return new Response(request.method === 'HEAD' ? null : openapi, {
      headers: { ...security, 'content-type': 'application/json; charset=utf-8' },
    });
  const key = path === '/index.html' ? '/' : path;
  if (!(key in assets)) return new Response('Not found', { status: 404, headers: security });
  const asset = assets[key];
  if (asset?.base64)
    return new Response(
      request.method === 'HEAD'
        ? null
        : Uint8Array.from(atob(asset.base64), (c) => c.charCodeAt(0)),
      {
        headers: {
          ...security,
          'content-type': asset.contentType,
          'cache-control': 'public, max-age=3600',
        },
      }
    );
  const type = key.endsWith('.js')
    ? 'text/javascript'
    : key.endsWith('.css')
      ? 'text/css'
      : 'text/html';
  return new Response(request.method === 'HEAD' ? null : assets[key], {
    headers: {
      ...security,
      'content-type': type + '; charset=utf-8',
      'cache-control': 'no-cache',
    },
  });
}

async function gameRequest(request, env, context) {
  const SQL = await sqlReady;
  for (let attempt = 0; attempt < 6; attempt++) {
    let previous;
    try {
      previous = await env.DB.prepare(
        'SELECT revision, image FROM game_snapshot WHERE id=1'
      ).first();
    } catch (error) {
      if (!String(error?.message).includes('no such table: game_snapshot')) throw error;
      await env.DB.prepare(
        'CREATE TABLE IF NOT EXISTS game_snapshot (id INTEGER PRIMARY KEY CHECK (id = 1), revision INTEGER NOT NULL, image BLOB NOT NULL)'
      ).run();
      previous = null;
    }
    const store = new SqlJsStore(SQL, await unpack(previous?.image));
    let server;
    try {
      const backfillLegacy = !store.get(
        "SELECT value FROM runtime_metadata WHERE key='legacy_awards_backfilled'"
      );
      const publishContent =
        store.get("SELECT value FROM runtime_metadata WHERE key='publication_fingerprint'")
          ?.value !== publicationFingerprint;
      const app = createApp({
        publishContent,
        backfillLegacy,
        store,
        publicOrigin: new URL(request.url).origin,
        secureCookie: true,
        sweep: false,
      });
      if (backfillLegacy)
        store.run("INSERT INTO runtime_metadata VALUES('legacy_awards_backfilled','1')");
      if (publishContent)
        store.run(
          "INSERT OR REPLACE INTO runtime_metadata VALUES('publication_fingerprint',?)",
          publicationFingerprint
        );
      server = app.server;
      const handler = httpServerHandler(server);
      const served = await handler.fetch(request.clone(), env, context);
      const body = [204, 205, 304].includes(served.status) ? null : await served.arrayBuffer();
      if (previous && !store.hasChanges())
        return new Response(body, { status: served.status, headers: served.headers });
      const image = await pack(store.export());
      if (image.byteLength >= 1_900_000)
        throw new Error('D1 snapshot is approaching its row-size limit');
      const statement = previous
        ? env.DB.prepare(
            'UPDATE game_snapshot SET revision=revision+1,image=? WHERE id=1 AND revision=?'
          ).bind(image.buffer, previous.revision)
        : env.DB.prepare(
            'INSERT INTO game_snapshot(id,revision,image) VALUES(1,1,?) ON CONFLICT(id) DO NOTHING'
          ).bind(image.buffer);
      const saved = await statement.run();
      if (saved.meta.changes === 1)
        return new Response(body, { status: served.status, headers: served.headers });
    } finally {
      server?.close();
      store.close();
    }
  }
  return new Response(JSON.stringify({ error: { code: 'BUSY', message: 'Попробуйте ещё раз.' } }), {
    status: 503,
    headers: {
      ...security,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export default {
  async fetch(request, env, context) {
    const path = new URL(request.url).pathname;
    if (path !== '/api/openapi.json' && path.startsWith('/api/')) {
      try {
        return await gameRequest(request, env, context);
      } catch (error) {
        console.error('Game request failed', error?.message || error);
        return new Response(
          JSON.stringify({
            error: { code: 'UNAVAILABLE', message: 'Сервер временно недоступен.' },
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
    return responseForStatic(request, path);
  },
};
