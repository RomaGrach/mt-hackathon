# Sites deployment of РЕЙС 400 v2

Status: deployment source prepared. Do not replace the existing `mt-hackathon` Site until a durable backend is online and the legacy D1 sessions have a migration or separate archival route.

The game in `main` runs on Node.js 24 with synchronous `node:sqlite`. ChatGPT Sites executes server code in Cloudflare Workers, where `node:sqlite` is a stub, and Workers' writable filesystem is temporary. D1 is durable, but its API is asynchronous and cannot be passed into the current synchronous `Store` without a validated storage adapter and concurrency migration. A static-only deployment would lose every server-authoritative game rule. The existing Sites deployment has a D1 `reis_sessions` table containing legacy session data; overwriting it without migration would make those records inaccessible.

## Ready architecture

The v2 frontend is built from the existing source with `npm run build:sites`. The Worker in `worker/sites-proxy.js` serves an explicit static allowlist and forwards `/api/` to `API_UPSTREAM_ORIGIN`. Browser and API paths therefore stay on the same Sites origin; `reis_session` remains `HttpOnly; Secure; SameSite=Strict` and the existing Origin / `X-Reis-Client` checks remain active. The Worker adds a shared secret on its server-to-server request. The backend rejects direct `/api/` traffic without this secret, using constant-time comparison. This is a transport layer; game rules, timers, points, and idempotency stay in the Node service.

The external Node service needs an always-on host with Docker, a persistent volume, a public DNS name, inbound TCP 80/443, and HTTPS. `deploy/compose.production.yaml` runs the existing game image with a named SQLite volume and Caddy for TLS. `HR_API_KEY` stays disabled. Do not run a temporary process in an agent workspace as deployment.

## Activation after a host is selected

1. Point `API_HOSTNAME` at the host. Generate a 32+ character random `PROXY_SHARED_SECRET`; keep it only in the host environment and Sites secret settings. Set `PUBLIC_ORIGIN` to the final Sites HTTPS origin, `API_HOSTNAME` to the backend DNS name, and start `docker compose --env-file <private-env-file> -f deploy/compose.production.yaml up --build -d` from the repository root. Back up the Docker volume. `/api/health` on the backend requires the shared secret header.
2. Set Sites `API_UPSTREAM_ORIGIN=https://<API_HOSTNAME>` and secret `PROXY_SHARED_SECRET`. Build with `npm run build:sites`. Use the Sites source workflow and deploy an archive built from the pushed source commit. Do not place the secret in Git, the frontend bundle, or `.openai/hosting.json`.
3. Preserve the existing Site and its D1 data. Deploy the v2 frontend to a separately named Site until old D1 sessions are migrated into the Node database, or supply a tested archival route on the old Site. Do not overwrite the old Site with the v2 worker without settling this data migration.
4. Verify on the published URL: session creation, a full shift, reload mid-run, deadline after reload and timeout, debrief acknowledgement, XP, leaderboard, profile, notifications, requestId duplicate, `/api/health`, `/api/openapi.json`, static file denylist, mobile width 360 px, console and failed requests, and backend after session/host restart.

Neither a Site version nor a production URL for v2 should be reported as ready before step 4 succeeds. The existing published Site is an earlier version and must not be presented as this v2 deployment.
