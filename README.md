# Pypr

Pypr is a resume builder. Candidates create, edit, preview and download professional resumes.

Status: **Milestones 1–11 are done.** Candidates register (with email verification), sign in,
create resumes, edit them with autosave and a live preview, and download a PDF rendered from the
same template. The theme follows the OS until you pick Light or Dark (navbar toggle or Settings). See [docs/architecture.md](docs/architecture.md) for the plan and package
boundaries, and [docs/decisions.md](docs/decisions.md) for the decisions behind it.

## Requirements

- Node.js 24 (LTS); see `.nvmrc`
- pnpm 10.34.5 (pinned through `packageManager`; `corepack enable` picks it up)
- Access to the Supabase project's connection string, for `DATABASE_URL`
- Docker Desktop, for the local test database

## Setup

```sh
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
# set DATABASE_URL in apps/api/.env to the Supabase connection string (see .env.example)
pnpm db:up                                # start local PostgreSQL (used by the tests)
pnpm --filter @pypr/api db:deploy         # apply pending migrations to DATABASE_URL
pnpm --filter @pypr/api exec playwright-core install chromium --only-shell   # for PDFs
pnpm verify   # lint, type check, test and build every package, then check formatting
pnpm dev      # web on http://localhost:3000, API on http://localhost:4000/api
```

In development the browser only talks to the web app. Requests to `localhost:3000/api/*` are
proxied to the API, so `curl localhost:3000/api/health` returns `{"status":"ok","database":"ok"}`
(or 503 when the database is unreachable).

Production setup is in [docs/deployment.md](docs/deployment.md); the security review is in
[docs/security.md](docs/security.md).

## API

API docs (Swagger UI) run at `http://localhost:4000/api/docs` outside production. All routes are under `/api`. Every route needs a signed-in session unless it says "public".
Requests that change data (`POST`, `PUT`, `PATCH`, `DELETE`) must send an allowed `Origin` header;
browsers do this automatically, so with curl add `-H 'Origin: http://localhost:3000'`.

| Route                                | Access    | What it does                                                                                                                   |
| ------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/health`                    | public    | `200 {"status":"ok","database":"ok"}`, or 503 if the database is down                                                          |
| `POST /api/auth/register`            | public    | `{ email, password }` (10–128 chars). Creates an unverified account and emails a link. 409 `EMAIL_ALREADY_REGISTERED` if taken |
| `POST /api/auth/verify-email`        | public    | `{ token }` from the link. Verifies the email and signs in                                                                     |
| `POST /api/auth/resend-verification` | public    | `{ email }`. Sends a new link if needed; always 202                                                                            |
| `POST /api/auth/login`               | public    | `{ email, password }`. Signs in. 403 `EMAIL_NOT_VERIFIED` until verified                                                       |
| `POST /api/auth/refresh`             | public    | Swaps the refresh cookie for new tokens                                                                                        |
| `POST /api/auth/logout`              | public    | Ends the session and clears the cookies                                                                                        |
| `GET /api/auth/me`                   | signed in | The current user                                                                                                               |
| `GET /api/resumes`                   | signed in | The user's resumes, newest first                                                                                               |
| `POST /api/resumes`                  | signed in | `{ title, template? }` with an `Idempotency-Key` UUID header                                                                   |
| `GET /api/resumes/:id`               | signed in | The resume (`{ id, revision, schemaVersion, updatedAt, content }`)                                                             |
| `PUT /api/resumes/:id`               | signed in | `{ revision, content }`. 409 `REVISION_CONFLICT` if stale                                                                      |
| `DELETE /api/resumes/:id`            | signed in | Deletes it                                                                                                                     |
| `GET /api/resumes/:id/pdf`           | signed in | PDF download (`?pageSize=A4` or `Letter`)                                                                                      |
| `POST /api/resume-imports`           | signed in | Multipart `file` (PDF/DOCX, ≤ 5 MB) → parsed `{ content, warnings }`, not saved                                                |

Verify-email, login and refresh return `{ "user": { "id", "email" } }`. Errors the web app acts
on carry a `code` (`AUTH_ERROR_CODES` in `@pypr/validation`). Tokens are only ever in
`HttpOnly` cookies: `pypr_at` (access, 15 minutes) and `pypr_rt` (refresh, 30 days, sent only to
`/api/auth`). Auth routes are rate-limited per client IP: 10 requests a minute (refresh: 30).

## Environment variables

| App   | File         | Variable                  | Default                          | Purpose                                                           |
| ----- | ------------ | ------------------------- | -------------------------------- | ----------------------------------------------------------------- |
| `api` | `.env`       | `NODE_ENV`                | `development`                    | `development`, `test` or `production`                             |
| `api` | `.env`       | `PORT`                    | `4000`                           | Port the API listens on                                           |
| `api` | `.env`       | `DATABASE_URL`            | none (required)                  | Supabase Postgres connection string                               |
| `api` | `.env`       | `JWT_ACCESS_SECRET`       | none (required)                  | Access token signing key, 32+ random characters                   |
| `api` | `.env`       | `WEB_ORIGINS`             | `http://localhost:3000`          | Origins allowed to send data-changing requests                    |
| `api` | `.env`       | `TRUST_PROXY`             | `loopback`                       | Proxies trusted for the client IP (rate limits)                   |
| `api` | `.env`       | `APP_URL`                 | `http://localhost:3000`          | Web app URL used in emailed links                                 |
| `api` | `.env`       | `EMAIL_PROVIDER`          | `console`                        | `resend` sends; `console` logs emails (not allowed in production) |
| `api` | `.env`       | `RESEND_API_KEY`          | none                             | Required when `EMAIL_PROVIDER=resend`                             |
| `api` | `.env`       | `RESUME_PARSER_PROVIDER`  | `disabled`                       | `openrouter` turns on AI resume import                            |
| `api` | `.env`       | `OPENROUTER_API_KEY`      | none                             | Required with `openrouter`                                        |
| `api` | `.env`       | `OPENROUTER_RESUME_MODEL` | `openai/gpt-4.1-mini`            | OpenRouter model id (see D22)                                     |
| `api` | `.env`       | `PDF_CONCURRENCY`         | `2`                              | PDFs rendered at once                                             |
| `api` | `.env`       | `PDF_TIMEOUT_MS`          | `15000`                          | Give up on a PDF after this long                                  |
| `api` | `.env`       | `EMAIL_FROM`              | `Pypr <no-reply@send.pypr.work>` | Sender; its domain must be verified in Resend                     |
| `api` | shell        | `TEST_DATABASE_URL`       | local `pypr_test`                | Database for API tests; name must end in `_test`                  |
| `web` | `.env.local` | `API_URL`                 | `http://localhost:4000`          | Where `/api/*` is proxied (server-side only)                      |

With `EMAIL_PROVIDER=console`, emails (with their links) are printed in the API log.
Tests ignore `.env` entirely and use an in-memory email adapter.

Both apps validate their variables at startup and stop with a message naming the bad variable.
Errors never print the value. Never commit `.env` or `.env.local`; only the `.env.example` files
are tracked.

## Commands

Run these from the repository root. Turborepo runs each task in dependency order and caches the results.

| Command            | What it does                                                      |
| ------------------ | ----------------------------------------------------------------- |
| `pnpm dev`         | Build shared packages, then run web and API in watch mode         |
| `pnpm build`       | Build everything (`dist/` for packages and API, `.next/` for web) |
| `pnpm lint`        | ESLint with type-aware rules, zero warnings allowed               |
| `pnpm check-types` | `tsc --noEmit` per package, including tests                       |
| `pnpm test`        | Vitest in every package that has tests                            |
| `pnpm verify`      | Everything above except `dev`, plus `prettier --check`            |
| `pnpm format`      | Format the repository with Prettier                               |
| `pnpm db:up`       | Start PostgreSQL in Docker and wait until it is ready             |
| `pnpm db:stop`     | Stop the PostgreSQL container (data is kept)                      |
| `pnpm e2e`         | Build the API, then run the Playwright end-to-end tests           |

API tests use the `pypr_test` database, so `pnpm test` and `pnpm verify` need PostgreSQL running.
Tests apply pending migrations to it first, and refuse to run against a database whose name
doesn't end in `_test`.

### Database

Only migrations change the schema (decision D6). There are no reset or `db push` scripts.

| Command                                            | What it does                                                                           |
| -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `pnpm --filter @pypr/api db:migrate --name <name>` | Create a migration from `schema.prisma` and apply it to dev                            |
| `pnpm --filter @pypr/api db:deploy`                | Apply pending migrations (no prompts, never resets)                                    |
| `pnpm --filter @pypr/api db:status`                | Show which migrations are applied                                                      |
| `pnpm --filter @pypr/api db:generate`              | Regenerate the Prisma client (Turborepo runs this before build, lint, types and tests) |

To run a task for one package only, use `pnpm turbo run test --filter=@pypr/api`.
After `pnpm build`, `pnpm --filter @pypr/api start` and `pnpm --filter @pypr/web start` run the
production builds.

## Layout

```
apps/
  api/                NestJS REST API, global prefix /api; Prisma schema in prisma/
  web/                Next.js App Router, Tailwind CSS
  e2e/                Playwright end-to-end and accessibility tests
packages/
  resume-core/        Resume domain: schemas and pure operations, no framework code
  validation/         Request/response schemas shared by web and API
  templates/          Resume templates and the HTML renderer (preview and PDF)
  tsconfig/           Shared TypeScript presets (strict)
  eslint-config/      Shared flat ESLint config
docker/postgres/      Init script that creates the test database
docs/                 Architecture, decisions, security review, deployment guide
```
