# Architecture

Pypr is a modular monolith in one pnpm + Turborepo monorepo: a Next.js web app, a NestJS REST
API, and a few shared TypeScript packages. Recruiter features, payments and OAuth come later
and are deliberately not built yet.

## Packages

| Package               | Status | Purpose                                                            | May depend on          |
| --------------------- | ------ | ------------------------------------------------------------------ | ---------------------- |
| `@pypr/tsconfig`      | done   | Strict TypeScript presets (`base.json`, `library.json`)            | —                      |
| `@pypr/eslint-config` | done   | Flat ESLint config: `strictTypeChecked` + Prettier compatibility   | —                      |
| `@pypr/resume-core`   | done   | Resume domain: Zod schemas, pure operations, schema versioning     | `zod` only             |
| `@pypr/validation`    | done   | API request/response schemas and error codes shared by web and API | `resume-core`, `zod`   |
| `@pypr/templates`     | done   | Template contract, view model, Classic template, HTML renderer     | `resume-core`, `react` |
| `apps/api`            | done   | NestJS REST API at `/api`: auth, resumes, PDF, Swagger             | all packages           |
| `apps/web`            | done   | Next.js App Router: landing, auth pages, dashboard, editor         | all packages           |
| `apps/e2e`            | done   | Playwright end-to-end and accessibility tests                      | — (drives the apps)    |

Rules:

- `resume-core` holds the domain rules, including unique standard sections (schema version 2),
  resume presentation settings and the rich-text format (D25).
- `resume-core` never imports React, Next.js, NestJS, Prisma or browser APIs.
- Database models and queries live only in `apps/api`.
- Shared packages compile with `tsc` to `dist/` and are consumed through explicit `exports`.
  Turborepo builds dependencies first (`dependsOn: ["^build"]`).
- No `ui` or `types` package: only one app renders UI, and types are inferred from Zod schemas.

## Apps

**API (`apps/api`)**

- NestJS 12 (native ESM), built with the Nest CLI (`tsc`) into `dist/`.
- `src/configure-app.ts` holds the HTTP setup shared by `main.ts` and the tests: the global
  `/api` prefix and helmet security headers. Tests boot the real `AppModule` with that same
  setup, so the tests match production.
- Config: `@nestjs/config` loads `.env`, and `src/config/env.ts` validates it with Zod. Bad
  config stops startup.
- Database: Prisma 7 with the `pg` driver adapter. `prisma/schema.prisma` is the source of truth;
  `prisma.config.ts` loads `.env`. The client is generated into `src/generated/prisma` (git-ignored)
  by the `db:generate` task, which `apps/api/turbo.json` runs before build, lint, types, tests and dev.
  `DatabaseModule` provides one global `PrismaService`; it connects on first query.
- Tables: `users` (with `email_verified_at`), `sessions`, `refresh_tokens`, `identity_providers`
  (see D9), `user_tokens` (emailed one-time tokens, D14).
  Snake_case names, UUIDv7 ids, `timestamptz(3)`, named indexes. CHECK constraints that Prisma
  can't express are written by hand in the migration SQL.
- Resumes (`src/resumes`, milestone 6, D3): list, create (Idempotency-Key header), get, save
  (whole document + revision; 409 `REVISION_CONFLICT` when stale), delete, and
  `GET /api/resumes/:id/pdf` (milestone 10). Every query is scoped by owner. Saves write only
  changed rows inside one transaction that starts with the conditional revision bump.
- PDF (`src/integrations/pdf`, D7, D16): `PdfRenderer` port, `PlaywrightPdfRenderer` adapter
  (one shared Chromium, a fresh context per render, JavaScript off, network blocked, concurrency
  limit, timeout). The HTML comes from `@pypr/templates`, the same as the preview.
- Resume import (`src/resume-import`, D22): upload checks, in-memory text extraction,
  normalization into `ResumeContent`; the AI call goes through the `ResumeParser` port
  (`src/integrations/resume-parser`: OpenRouter and disabled adapters). Nothing is saved there;
  the client creates the resume with `POST /api/resumes { title, content }`.
- Errors: `AllExceptionsFilter` logs unexpected errors as one redacted line and answers 500.
- Swagger UI at `/api/docs` (JSON at `/api/docs-json`) outside production; schemas are generated
  from the Zod schemas.
- Endpoint: `GET /api/health` runs `SELECT 1` and returns `{ "status": "ok", "database": "ok" }`,
  or 503 `{ "status": "error", "database": "unreachable" }`.
- Auth (`src/auth`, milestone 4, decisions D4, D9, D12):
  - `AuthGuard` is global: every route needs a valid access token unless marked `@Public()`.
    It verifies the JWT and checks that its session isn't revoked (one primary-key lookup), so
    logout takes effect immediately. `@CurrentAuth()` gives handlers the user and session ids.
  - `AuthService`: register, login, refresh (rotation with reuse detection), logout.
    `PasswordService` wraps argon2id; `TokensService` signs HS256 JWTs with `jose` and makes
    refresh tokens (32 random bytes, stored as SHA-256).
  - `configureApp` adds `cookie-parser`, the Origin check (`src/common/origin-check.ts`) and
    `trust proxy`. `ZodBodyPipe` validates bodies with schemas from `@pypr/validation`.
  - Rate limits: `@nestjs/throttler`, in memory, on `AuthController` only.
  - Email verification: register creates an unverified user and emails a one-time link
    (`user_tokens`, purpose `verify_email`, 24 h). `verify-email` consumes it and signs in. Login
    answers 403 `EMAIL_NOT_VERIFIED` until then.
- Integrations (`src/integrations/<kind>/`, decision D13): every third-party service sits behind a
  port (abstract class, also the Nest DI token) with one adapter per provider, a local adapter and
  a test fake. Only the adapter imports the provider SDK.
  - Email: `EmailSender` port; `ResendEmailSender`, `ConsoleEmailSender`; tests use
    `test/support/in-memory-email-sender.ts`. `EmailModule` picks one from `EMAIL_PROVIDER`.
- Tests: `vitest.config.ts` points `DATABASE_URL` at `pypr_test` (or `TEST_DATABASE_URL`).
  `test/global-setup.ts` refuses databases not named `*_test`, then runs `prisma migrate deploy`.

**Web (`apps/web`)**

- Next.js 16 App Router with Turbopack, React 19, Tailwind CSS 4.
- Design tokens live in `src/app/globals.css` (`@theme`). Components use token names such as
  `bg-canvas`, `text-ink-muted` and `text-accent`, not raw colors. Dark values are the CSS defaults;
  `[data-theme='light']` overrides them (D10, D20). Colors and font follow the Vercel-inspired palette (D25).
- Theme: `src/lib/theme.ts` holds the preference logic and the inline `<head>` script that sets
  `data-theme` before first paint; with no saved choice it follows the OS (D20). The landing and
  auth navbars have `ThemeToggle` (light/dark); `/settings` has Dark, Light and System. The choice
  is kept in `localStorage`. Fonts: Poppins (text) and Space Grotesk (logo) via `next/font`.
- Pages: `/` (landing, from the earlier pypr-ui project), `/settings` (theme, signed in), `/register`,
  `/login`, `/verify-email` (verifies on click, not on load), `/dashboard` and `/resumes/[id]`.
  The three auth pages share `app/(auth)/layout.tsx`: the landing backdrop and a form card.
- `next.config.ts` validates `API_URL` and rewrites `/api/*` to the API, so the browser sees one
  origin and auth cookies stay same-origin (decision D5).
- UI primitives (`src/components/ui`: button, field, alert, dialog) are hand-written on the
  design tokens instead of shadcn/ui (D15).
- Data access: `src/lib/api.ts` calls the API through the `/api` proxy and refreshes the session
  once on 401 — one refresh at a time across tabs via the Web Locks API (D12).
- App area (`src/app/(app)`): `SessionProvider` loads the user and sends signed-out visitors to
  `/login?next=…` (`safeNextPath` prevents open redirects). Pages render inside `AppShell`
  (`src/components/app-shell/`, D21): a full-height sidebar (Resumes; Settings at the bottom),
  collapsible on desktop and a drawer on small screens, a minimal header with the account menu,
  and a main area that scrolls on its own. `/dashboard`, `/resumes/[id]` and `/settings` live here.
- Editor (`src/components/editor`, D23): full-height split (Form/Templates tabs + preview),
  controls in the shell header via `AppHeaderSlot`, accordion sections, drag-and-drop ordering
  (`@dnd-kit`). Edits go through `resume-core` operations; `lib/autosave.ts`
  saves after an 800 ms pause, one request at a time, retries with backoff, holds back invalid
  content and stops on a revision conflict. Saves also run when the tab is hidden.
- Preview: `ResumePreview` renders `renderResumeHtml` into a sandboxed iframe (no scripts), so
  the preview and the PDF are the same document.
- Security headers (CSP, frame denial, HSTS…) in `next.config.ts`.

## Tooling

- **TypeScript 6.0.x** everywhere. `@nestjs/cli` and `typescript-eslint` don't support 7 yet.
- **Module format:** ESM (`"type": "module"`, `NodeNext` resolution), so relative imports use `.js` extensions.
- **Strictness:** `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, no unused locals/params.
- **Lint:** ESLint 10 with `typescript-eslint` strict type-checked rules; `any` is an error. The
  web app adds `@next/eslint-plugin-next` (core-web-vitals) and `eslint-plugin-react-hooks`
  (see decision D8). The API tells the parser about decorator metadata so type-only imports
  don't break Nest dependency injection.
- **Tests:** Vitest 5. Unit tests sit next to the source (`*.test.ts`) and are left out of
  builds. API HTTP tests live in `apps/api/test/` and use supertest. Vitest (Vite 8) emits
  decorator metadata from `tsconfig.json`, so Nest dependency injection works in tests without SWC.
- **Formatting:** Prettier (single quotes, trailing commas, width 100).
- **Versions:** dependencies are pinned to exact versions that were at least two weeks old when added.

## Turborepo tasks

| Task          | Depends on | Cached outputs                       |
| ------------- | ---------- | ------------------------------------ |
| `build`       | `^build`   | `dist/**`, `.next/**` (minus caches) |
| `check-types` | `^build`   | —                                    |
| `lint`        | `^build`   | —                                    |
| `test`        | `^build`   | —                                    |
| `dev`         | `^build`   | not cached                           |

Turborepo runs in strict env mode: a task only sees environment variables listed in
`turbo.json`. `build` declares `API_URL` and includes `.env*` files in its hash, so changing
either rebuilds the web app. Add every new build-time variable there.

## Milestones

1. **Done:** workspace, Turborepo, shared config, package scaffolds
2. **Done:** Next.js and NestJS skeletons, `/api/health`, env validation, `/api` proxy
3. **Done:** local PostgreSQL (Docker), Prisma 7, auth tables, first migration
4. **Done:** auth: register/login/refresh/logout, guards, rate limits
5. **Done:** resume domain in `resume-core`
6. **Done:** resume tables and CRUD API, ownership tests, Swagger
7. **Done:** auth pages and candidate dashboard
8. **Done:** resume editor with autosave
9. **Done:** template contract, first template, live preview
10. **Done:** server-side PDF export
11. **Done:** end-to-end tests, security review ([security.md](security.md)), deployment docs
    ([deployment.md](deployment.md))
