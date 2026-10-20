# Deployment

> **Current production setup (2026-10-20, decision D26):** the API runs on the home server
> (`homeserver`, Ubuntu 24.04) in Docker, bound to `127.0.0.1:8081`, behind the existing
> Cloudflare Tunnel that routes `api.pypr.work` there. The web app is on Vercel (`pypr.work`),
> the database on Supabase. See [Home server](#home-server) below; the rest of this guide
> describes the general setup.

How to run Pypr in production. Pypr is three parts: the web app (Next.js), the API (NestJS, with
headless Chromium for PDFs) and PostgreSQL (Supabase).

## Topology

```
browser ──https──▶ web (app.pypr.work, Next.js) ──/api/* proxy──▶ API (private, port 4000) ──TLS──▶ Supabase Postgres
                                                                    └─ Resend (email)
```

- The browser only ever talks to the web app's origin. Next.js forwards `/api/*` to the API
  (the `rewrites` in `apps/web/next.config.ts`). Auth cookies are therefore first-party and
  `SameSite=Lax` works without CORS (decision D5).
- Keep the API **off the public internet** (private network, or an allowlist for the web app).
  It trusts `X-Forwarded-For` from its proxies for rate limiting; a public API would let clients
  spoof their IP.
- The API needs a container host (Chromium can't run on strict serverless): Fly.io, Render,
  Railway, Cloud Run or a VM. The web app can run on Vercel or as a Node container.

## 1. Database (Supabase)

1. Use the project's **direct connection** string (port 5432) for migrations. The app can use the
   same, or the session pooler.
2. Apply migrations as a release step, from CI or a machine with the repository:
   ```sh
   pnpm install --frozen-lockfile
   DATABASE_URL='postgresql://…' pnpm --filter @pypr/api db:deploy
   ```
   `migrate deploy` only applies pending migrations; it never resets. There is no `db push`
   (D6). Run it **before** starting the new API version; migrations are written to be additive
   so the previous version keeps working during the rollout.
3. TLS: download Supabase's CA certificate (Database settings → SSL) and connect with
   `sslmode=verify-full&sslrootcert=/path/to/ca.crt`. Until then use
   `sslmode=require&uselibpqcompat=true` (encrypted, not verified; see security.md).
4. Turn on point-in-time recovery or daily backups in Supabase.

## 2. Email (Resend)

1. The sending domain is `send.pypr.work` (verified in Resend on 2026-10-20). A subdomain keeps
   email reputation separate from the main domain. If it is ever recreated: Resend → Domains, add
   it, create the DNS records it shows (SPF, DKIM, optionally DMARC), wait for **Verified**.
2. Set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, and `EMAIL_FROM` (for example
   `Pypr <no-reply@send.pypr.work>`). The API refuses to start in production with any other provider.

## 3. API

Build the image from the repository root:

```sh
docker build -f apps/api/Dockerfile -t pypr-api .
docker run --env-file api.env -p 4000:4000 pypr-api
```

The image runs as a non-root user, includes Chromium's headless shell with its libraries and
the Liberation fonts, and has a health check on `/api/health` (200 when the database answers,
503 when it doesn't).

Environment variables (validated at startup; the API stops with a message naming any bad one):

| Variable                  | Production value                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`                | `production` (turns off Swagger, requires Resend, sets `Secure` cookies)                                                 |
| `PORT`                    | `4000`                                                                                                                   |
| `DATABASE_URL`            | Supabase connection string (see above)                                                                                   |
| `JWT_ACCESS_SECRET`       | 48+ random bytes: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`                       |
| `WEB_ORIGINS`             | `https://app.pypr.work`                                                                                                  |
| `APP_URL`                 | `https://app.pypr.work` (used in email links)                                                                            |
| `TRUST_PROXY`             | Number of proxies in front of the API that append `X-Forwarded-For`, e.g. `2` for platform edge + Next.js. Never `true`. |
| `EMAIL_PROVIDER`          | `resend`                                                                                                                 |
| `RESEND_API_KEY`          | From Resend                                                                                                              |
| `EMAIL_FROM`              | `Pypr <no-reply@send.pypr.work>`                                                                                         |
| `RESUME_PARSER_PROVIDER`  | `openrouter` to enable resume import (default `disabled`)                                                                |
| `OPENROUTER_API_KEY`      | From https://openrouter.ai/keys; set a monthly credit limit on the key                                                   |
| `OPENROUTER_RESUME_MODEL` | `openai/gpt-4.1-mini` (D22); re-check availability before changing                                                       |
| `PDF_CONCURRENCY`         | `2` per 1 GB of memory is a safe start                                                                                   |
| `PDF_TIMEOUT_MS`          | `15000`                                                                                                                  |

Sizing: 1 vCPU and 1 GB of memory handles normal traffic; PDFs are the heavy part.

**Run one instance** for now: rate-limit counters live in memory (D12). Before scaling out, move
them to a shared store (for example Redis via `@nestjs/throttler` storage).

Rotating `JWT_ACCESS_SECRET` signs everyone out of their current access token; they are signed
back in silently by the refresh cookie.

## 4. Web app

| Variable  | Value                                                                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `API_URL` | The API's private URL, e.g. `http://pypr-api.internal:4000`. Read at **build time** (rewrites are compiled into the build), so rebuild when it changes. |

- Vercel: set the project root to `apps/web`, install command `pnpm install --frozen-lockfile`,
  build command `pnpm turbo run build --filter=@pypr/web`.
- Container: `pnpm turbo run build --filter=@pypr/web`, then `pnpm --filter @pypr/web start`.

Security headers (CSP, frame denial, HSTS, …) are set by `next.config.ts`.

## 5. Release checklist

1. `pnpm verify` passes (needs local Postgres: `pnpm db:up`).
2. `pnpm e2e` passes (needs Chromium: `pnpm --filter @pypr/api exec playwright-core install chromium --only-shell`).
3. Apply migrations to production (`db:deploy`).
4. Deploy the API; wait for `/api/health` to return 200.
5. Deploy the web app.
6. Smoke test: register → verification email arrives → verify → create a resume → download PDF.

## Rolling back

Redeploy the previous API and web versions. Migrations are additive, so the previous version runs
on the newer schema. Never roll a migration back by hand in production; write a new migration
instead.

## Monitoring

- Uptime check on `https://app.pypr.work/api/health` (exercises web, proxy, API and database).
- Alert on API logs containing `UnhandledError`, `Verification email failed`, `PDF failed` and
  `Refresh token reuse detected` (the last one can mean a stolen token).

## Home server

**Layout on the server (`~/pypr-api`):**

| File          | What it is                                                                                            |
| ------------- | ----------------------------------------------------------------------------------------------------- |
| `compose.yml` | Copied from `deploy/home-server/compose.yml` by the deploy script                                     |
| `api.env`     | Production settings and secrets (`chmod 600`, never in git; see `deploy/home-server/api.env.example`) |
| `.env`        | Only `PYPR_API_TAG` / `PYPR_API_PREVIOUS_TAG` (written by the deploy script)                          |

**Ingress.** A Cloudflare-managed tunnel (`cloudflared.service`, token-based) routes
`api.pypr.work` → `http://127.0.0.1:8081` and `ai.pypr.work` → LiteLLM. Its routes are edited in
the Cloudflare dashboard (Zero Trust → Networks → Tunnels), not on the server. The API binds
localhost only, so it isn't reachable from the LAN or the internet except through the tunnel.

**Deploy** (from a clean checkout on the Mac, with SSH alias `homeserver`):

```sh
scripts/deploy-api.sh            # build pypr-api:<commit>, copy it over SSH, start, wait until healthy
scripts/deploy-api.sh rollback   # switch back to the previous image
```

**Migrations** are never run by the deploy. Review and apply them first, from the Mac:
`DATABASE_URL=<production url> pnpm --filter @pypr/api db:status`, then `db:deploy`.

**Operate:**

```sh
ssh homeserver 'cd ~/pypr-api && docker compose ps'            # status and health
ssh homeserver 'docker logs --tail 100 -f pypr-api'           # logs (rotated: 5 × 10 MB)
ssh homeserver 'cd ~/pypr-api && docker compose restart'       # restart
curl https://api.pypr.work/api/health                          # end to end, through Cloudflare
```

The container restarts on crashes (`unless-stopped`) and starts with Docker at boot. Docker is
the snap package, which has two quirks: `init: true` and `no-new-privileges` both make every
program fail to start ("operation not permitted"), so the image runs `tini` itself and the
container relies on a non-root user, dropped capabilities and a read-only filesystem instead.

**Changing a secret:** edit `~/pypr-api/api.env` on the server, then
`docker compose up -d --force-recreate`. Values containing `&` must not go through `sed`
replacements unescaped.
