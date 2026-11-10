# pypr architecture

Job seeker platform: resume builder, persona-tailored interview prep (Software Engineer first),
AI mock interview, job tracker. Built one approved milestone at a time.

## Layout

```
pypr/
  design.md      design system rules, tokens, components (read before any UI work)
  docs/          architecture.md (this file), decisions.md
  web/           Next.js 16 (App Router, Cache Components), Tailwind v4, shadcn (radix), TanStack Query, Tiptap
  backend/       Go HTTP API (net/http, pgx, goose), PostgreSQL hosted on Supabase, used as a plain database
```

The browser only talks to `web`. `web` rewrites `/api/*` to the Go backend (`BACKEND_URL`), so the
session cookie is first-party and there is no CORS surface. Server components validate the session by
calling `GET /api/auth/me` with the cookie (`web/lib/server/session.ts`).

### Backend (`backend/`)

| Path | Owns |
|---|---|
| `cmd/api` | Process wiring: env, migrations, pool, graceful shutdown |
| `internal/config` | Env config (`.env.example`) |
| `internal/db` | pgx pool (`search_path=app`), embedded goose migrations |
| `internal/auth` | argon2id passwords, DB sessions, password reset, email verification, `RequireUser` / `RequireVerified` middleware, handlers |
| `internal/email` | `Sender` port; `resend` adapter; `log` dev adapter; `Fake` for tests |
| `internal/openrouter` | Chat-model client shared by the AI adapters (JSON replies) |
| `internal/jobs` | In-memory background jobs the web app polls (slow AI calls) |
| `internal/jobmatch` | `Analyzer` port: reads a job posting's requirements; `openrouter` adapter; `Fake` for tests; handlers |
| `internal/resumeparse` | `Parser` port for resume upload; `openrouter` adapter (free LLMs, PDF text plugin, DOCX text in Go); `Fake` for tests |
| `internal/resume` | Resume CRUD scoped to the current user; data stored as opaque JSON |
| `internal/tracker` | Job tracker: tracked jobs, status history, resume snapshots, notes, interviews, next action, duplicate checks, SSRF-safe job page extraction (see `docs/job-tracker.md`) |
| `internal/workspace` | Preparation workspaces: context, linked resumes, shared skill levels, plan activities and progress, rule-based suggestions, `Planner` AI port (see `docs/workspaces.md`) |
| `internal/pdf` | `Renderer` port; `chrome` adapter (chromedp, local headless Chrome); `Fake` for tests |
| `internal/httpx` | JSON helpers, JSON-only guard for mutations (CSRF), logging/recover, rate limiter |
| `internal/server` | Route table |

API: `POST /api/auth/{signup,login,logout,forgot-password,reset-password,verify-email,resend-verification}`, `GET /api/auth/me`,
`POST /api/job-analyses` + `GET /api/job-analyses/{id}` (AI reading of a job posting),
`POST /api/resume-imports` (upload: starts parsing, returns a job id) and `GET /api/resume-imports/{id}` (pending or the extracted fields; nothing is stored),
`GET|POST /api/resumes` (list rows include `data` for thumbnails), `GET|PUT|DELETE /api/resumes/{id}`,
`GET|POST /api/resumes/{id}/versions`, `POST /api/resumes/{id}/versions/{vid}/restore`, `DELETE /api/resumes/{id}/versions/{vid}`,
`GET|PUT /api/resumes/{id}/sharing`, public (no auth) `GET /api/public/resumes/{slug}` (counts a view, strips contact details
when hidden), PDF downloads `POST /api/resumes/{id}/pdf` and `POST /api/public/resumes/{slug}/pdf` (counts a
download), token-only `GET /api/render/resumes/{id}` for the print page, `GET /api/health`.
Workspaces: see the API table in `docs/workspaces.md`. Job tracker: see `docs/job-tracker.md`.

Version history: the first save of an editing session (30 min gap) snapshots the previous state. Autosaves are kept
90 days, at most 50 per resume; named versions stay until deleted. Restoring saves the current state first.

All tables live in the `app` Postgres schema. Other schemas in the database are untouched.

### Web (`web/`)

| Path | Owns |
|---|---|
| `app/page.tsx` | Landing |
| `app/(auth)/*` | Login, signup, forgot and reset password |
| `app/(app)/layout.tsx` | Session check (Suspense) + `UserProvider` |
| `app/(app)/(shell)` | Pages with the sidebar (`AppShell`); `resumes` is the resume list |
| `app/(app)/resumes/[id]` | Full-screen builder (no sidebar) |
| `app/print/[id]` | Print page headless Chrome turns into the PDF (token-only, `noindex`) |
| `app/r/[slug]` | Public resume page (no auth; `noindex` unless the owner allows search engines) |
| `app/design-system` | Living reference for `design.md` |
| `proxy.ts` | Cookie-presence redirect for `/resumes/*` (fast path only) |
| `lib/api/*` | Fetch client, auth calls, resume and workspace query/mutation hooks |
| `app/(app)/(shell)/workspaces` | Workspace list, create form (`?resume=`, `?from=job-match`), `[id]` overview / plan / tests / knowledge / settings |
| `components/workspace` | Workspace frame (switcher, tabs), form, dashboard, plan editor, suggestions review, knowledge |
| `app/(app)/(shell)/job-tracker` | Job tracker board/table, add job, `[id]` job detail |
| `components/tracker`, `lib/tracker/meta.ts` | Job tracker UI, labels, due states, time-zone helpers |
| `lib/workspace/meta.ts` | Labels, module list, resume prefill, next-activity ranking, plan completion |
| `lib/resume/*` | Resume data model and section registry, defaults/normalization, formatting, exports (text, Markdown, Word), ATS checks and job match, print |
| `lib/server/public-resume.ts` | Server fetch of a public resume (memoized per request) |
| `components/resume/document` | Paper, templates (Modern, Classic, Minimal, Executive, Sidebar, Split), section renderer, safe rich-text renderer |
| `components/resume/builder` | Builder: header, Write / Design / Check / Share panels, Download & history sheet, preview canvas, autosave |

## Milestones

| # | Scope | Status |
|---|---|---|
| M1 | Design system, `design.md`, landing, `/design-system` | done |
| M2 | Go backend: config, Postgres, migrations, auth (signup/login/logout/me/forgot/reset), resume API, tests | done |
| M3 | Web auth pages, `/api` proxy, route protection, app shell + sidebar (Resumes live; Interview prep, Mock interview, Job tracker "Soon"), user menu | done |
| M4 | Resume list + builder: create (blank or SWE example), split editor with rich text, live preview, 3 templates, accent/paper, autosave, delete, PDF via print | done |
| B1 | Builder look and feel: header with modes, canvas, zoom pill, page-fit chip, Download split button | done |
| B2 | Write: section order/visibility/menus, entry menus, 7 more section types, custom sections, profile links | done |
| B3 | Design: 6 templates incl. two-column, entry layout, heading style, date format, text size, line height, margins, icons, link underline | done |
| B4 | Download formats (PDF, Word, Markdown, text, JSON) and version history | done |
| B5 | Check: rule-based ATS checks, job keyword match, parser view | done |
| B6 | Share: public page, address, privacy options, view/download counts | done |
| W1 | Preparation workspaces: create (blank, from a resume, from Job match), context, user-owned plans with check/count/checklist progress, self-assessed knowledge, suggestions (rules, optional AI) | done |
| P1 | Practice, phase 1: MCQ tests with tutor chat (37 topics incl. system design and Node.js), coding playground for DSA (JavaScript / TypeScript), Node.js, TypeScript, JavaScript and HTML + CSS, topic cards with a side drawer | done in dev (code runner not enabled in prod) |
| P2 | Machine coding: 30 staged problems (utilities, backend components, applications) with Practice / Interview / Review modes and AI review; System design: canvas boards with shapes and system components, design prompts | done in dev (machine coding needs the code runner) |
| J1 | Job tracker: add by link (JSON-LD extraction) or by hand, duplicate warnings, board/table, status history, apply confirmation with resume snapshot, notes, interviews, next action | done |

Next candidates: AI mock interview (records sessions with `workspace.RecordCompletion`), system design practice (written/spoken answers), Q&A.

## Running locally

```
cd backend && cp .env.example .env   # fill DATABASE_URL
go run ./cmd/api                     # :8080, applies migrations on start
cd web && pnpm install && pnpm dev   # :3000
```

## Deploying the API

The Go API runs on the home server in Docker (`backend/Dockerfile`: Go binary + Chrome headless shell),
from `~/pypr-go-api` with `deploy/homeserver/compose.yml` and `api.env` (secrets, chmod 600, not in git).
It binds `127.0.0.1:8081`; the existing Cloudflare Tunnel routes `api.pypr.work` there.
Deploy with `scripts/deploy-api.sh` (rsync source, build image tagged with the commit, restart,
wait for `/api/health`). The web app (Vercel, `www.pypr.work`) needs `BACKEND_URL=https://api.pypr.work`.

## Verify

`pnpm verify` at the repo root: backend gofmt, vet, tests, build; web lint, typecheck, build.
