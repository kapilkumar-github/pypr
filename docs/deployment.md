# Deployment

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
