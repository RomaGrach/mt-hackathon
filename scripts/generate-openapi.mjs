import { writeFileSync } from 'node:fs';
import { v2Paths, v2Schemas } from './openapi-v2.js';
const str = { type: 'string' },
  int = { type: 'integer', minimum: 0 },
  bool = { type: 'boolean' };
const crew = { type: 'string', enum: ['msk-1', 'msk-2', 'spb-1', 'spb-2'] };
const command = { type: 'string', minLength: 8, maxLength: 64, pattern: '^[a-zA-Z0-9-]+$' };
const routes = [
  ['get', '/api/health', 'Health and storage', null, 'public'],
  ['post', '/api/session', 'Create synthetic profile or reuse current session', { crew }, 'public'],
  ['get', '/api/bootstrap', 'Profile, catalogue, achievements, challenge and notices'],
  ['patch', '/api/profile', 'Change synthetic crew', { crew }],
  [
    'delete',
    '/api/profile',
    'Delete own profile and all its activity',
    { confirm: { const: true } },
  ],
  ['get', '/api/profile/export', 'Export own data without credentials'],
  ['post', '/api/logout', 'Revoke current session', {}],
  ['get', '/api/leaderboard', 'Top 50 within crew, depot or company'],
  [
    'post',
    '/api/notices/read',
    'Read own notices',
    { ids: { type: 'array', maxItems: 100, items: { type: 'string', maxLength: 249 } } },
  ],
  [
    'post',
    '/api/runs',
    'Start one scored or practice attempt',
    { scenarioId: str, practice: bool, requestId: command },
  ],
  ['get', '/api/runs/{id}', 'Read own run and settle expired timer'],
  [
    'post',
    '/api/runs/{id}/decision',
    'Choose an action; late actions become timeouts',
    { revision: int, requestId: command, optionId: { type: ['string', 'null'], maxLength: 64 } },
  ],
  [
    'post',
    '/api/runs/{id}/continue',
    'Close feedback and start next timer',
    { revision: int, requestId: command },
  ],
  [
    'post',
    '/api/runs/{id}/abort',
    'Finish as a failed attempt',
    { revision: int, requestId: command },
  ],
  [
    'post',
    '/api/runs/{id}/replay',
    'Replay from zero-based index as practice only',
    { index: int, requestId: command },
  ],
  ['get', '/api/integrations/v1/results', 'Read-only HR/LMS result events', null, 'integration'],
  [
    'get',
    '/api/integrations/v1/profiles',
    'Read-only HR/points-accounting profile snapshots',
    null,
    'integration',
  ],
];
const paths = {};
for (const [method, path, summary, properties, auth] of routes) {
  const security =
    auth === 'public' ? [] : auth === 'integration' ? [{ IntegrationKey: [] }] : [{ Session: [] }];
  const op = {
    summary,
    security,
    parameters: [],
    responses: {
      200: {
        description:
          'Success. See docs/API.md for complete response fields, scoring and pagination semantics.',
      },
      default: {
        description: 'JSON error: {error:{code,message}}. See docs/API.md for error codes.',
      },
    },
  };
  if (path === '/api/session' || path === '/api/runs' || path.endsWith('/replay'))
    op.responses['201'] = {
      description: 'Created; response includes profile bootstrap or authoritative run.',
    };
  if (path.includes('{id}'))
    op.parameters.push({
      in: 'path',
      name: 'id',
      required: true,
      schema: { type: 'string', format: 'uuid' },
    });
  if (properties) {
    op.requestBody = {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties,
            required: Object.keys(properties).filter(
              (k) =>
                !(path === '/api/session' && k === 'crew') &&
                !(path === '/api/runs' && k === 'practice')
            ),
          },
        },
      },
    };
    op.parameters.push({
      in: 'header',
      name: 'X-Reis-Client',
      required: true,
      schema: { const: 'web' },
    });
  }
  if (path === '/api/leaderboard')
    op.parameters.push({
      in: 'query',
      name: 'scope',
      schema: { type: 'string', enum: ['crew', 'depot', 'company'], default: 'crew' },
    });
  if (auth === 'integration') {
    op.parameters.push({
      in: 'query',
      name: 'limit',
      schema: { type: 'integer', minimum: 1, maximum: 200, default: 100 },
    });
    op.parameters.push({
      in: 'query',
      name: 'cursor',
      schema: path.endsWith('/results') ? int : { type: 'string', maxLength: 36 },
    });
  }
  paths[path] ||= {};
  paths[path][method] = op;
}
const spec = {
  openapi: '3.1.0',
  info: {
    title: 'РЕЙС 400 — API',
    version: '2.1.0',
    description:
      'Server-authoritative v2 ShiftRun and separate practice XP / weekly SP alongside legacy v1. Synthetic training, not for employment decisions. See docs/API-V2.md.',
  },
  servers: [{ url: '/' }],
  paths: { ...paths, ...v2Paths },
  components: {
    schemas: v2Schemas,
    securitySchemes: {
      Session: { type: 'apiKey', in: 'cookie', name: 'reis_session' },
      IntegrationKey: { type: 'http', scheme: 'bearer' },
    },
  },
};
writeFileSync(
  new URL('../docs/openapi.json', import.meta.url),
  JSON.stringify(spec, null, 2) + '\n'
);
console.log(Object.keys(spec.paths).length + ' documented paths');
