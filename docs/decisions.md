# Decisions

- **D1 Monorepo folders** `web/` (Next.js) and `backend/` (Go) side by side; pnpm for JS.
- **D2 Design system** shadcn radix-nova primitives themed with POC colors through CSS variables
  in `web/app/globals.css`. Semantic tokens only in app code. Dark mode via `next-themes`, class
  strategy, default `system`. Rules in `/design.md`.
- **D3 Rich text** Tiptap v3 (StarterKit minus headings/code/quotes/strike). Persist Tiptap JSON.
  Editor is client-only. Resume preview renders the JSON to React elements (no `innerHTML`), keeping
  only known nodes and http(s)/mailto links.
- **D4 Supabase = Postgres only.** No Supabase Auth or client SDK. Go backend connects with
  `DATABASE_URL`; credentials live in `backend/.env` (gitignored), never in the web app.
- **D5 Own schema `app`.** The database already had unrelated tables in `public`, and Supabase exposes
  `public` over its REST API. App tables live in `app` (not exposed), with RLS enabled and no policies
  as defense in depth. goose tracks versions in `app.goose_db_version`. Migrations run on API start.
- **D6 Auth owned by Go backend.** argon2id (OWASP params) password hashes; random 32-byte session
  tokens, only their SHA-256 stored; 30-day sessions in Postgres; `pypr_session` cookie is `HttpOnly`,
  `SameSite=Lax`, `Secure` when `COOKIE_SECURE=true`. Login compares against a dummy hash for unknown
  emails. Forgot-password never reveals whether an email exists; reset tokens are single-use, 1 hour,
  and revoke all sessions. Login (10/15 min) and reset requests (5/h) are rate-limited per email,
  in memory (single instance).
- **D7 CSRF.** Every mutating request must be `application/json` (browsers can't send that cross-site
  without a preflight the API never allows), plus `SameSite=Lax`.
- **D8 Same-origin API.** Next rewrites `/api/*` to the backend. `proxy.ts` only checks cookie presence;
  the `(app)` layout validates the session server-side inside `<Suspense>` (Cache Components).
- **D9 Resume storage.** One `resumes` row per resume: `title` + `data jsonb` (opaque to the API,
  validated as a JSON object, ≤ 512 KB). Every query is scoped by `user_id`; other users' IDs and
  malformed IDs both return 404. The web app normalizes stored data on load. The list endpoint
  returns each resume's `data` too, so the list can render real thumbnails (resumes are small; revisit
  with a stored preview or pagination if lists grow large).
- **D10 Autosave.** Builder saves 800 ms after the last edit; saves are serialized with a TanStack
  mutation scope so an older save can't overwrite a newer one; pending edits flush on unmount and the
  tab warns before closing with unsaved changes.
- **D11 PDF export** is rendered by the API with headless Chrome (`pdf.Renderer` port, `chrome` adapter
  via chromedp, `Fake` for tests; `PDF_PROVIDER`). The API signs a 1-minute HMAC token, Chrome opens the
  web page `/print/{id}?token=…`, which fetches the resume from `GET /api/render/resumes/{id}` with that
  token, marks `html[data-pdf-ready]` once fonts load, and Chrome prints a tagged PDF using the page's
  `@page` rule. Chrome only ever opens `APP_URL`, never a user-supplied URL. Max 3 renders at once,
  20 s timeout, 30 per 10 min per user (or per public address). The builder saves pending edits first.
  "Print" in the document menu still uses the browser print dialog with the same print stylesheet.
- **D21 Job tracker** (`docs/job-tracker.md`). Applying happens on the employer's site; Pypr only
  records the user's confirmation, never infers it from an opened link. Confirming copies the chosen
  resume (title + data, so template and design settings too) into an immutable snapshot in the same
  transaction as the applied date and status event; later records are labelled "added after applying".
  Extraction reads schema.org JobPosting JSON-LD, then OpenGraph, with no per-ATS scrapers and no AI;
  the fetcher checks the dialed IP so redirects and DNS rebinding can't reach private networks.
  Duplicate checks warn, never block. No reminders are sent (no notification infrastructure yet).
- **D20 Machine coding is staged and judged cumulatively; HLD is a canvas.** A machine coding problem is one file
  that grows through 2–3 stages, and stage k runs the tests of stages 1..k, so the exercise tests how an
  implementation evolves, not just whether a fixed task gets done. Redis stages use an injected in-memory
  `FakeRedis` prelude (failure injection included) instead of a real Redis, which keeps the runner offline and the tests
  deterministic. The mode (practice, interview, review) lives in a server-side session so hints, solutions and the clock
  cannot be bypassed from the browser. The bank is a fixed list of 30 seeds, drafted by the AI and kept only when the
  reference solutions pass on the runner. System design uses React Flow (MIT) rather than a hand-rolled canvas or an
  embedded whiteboard; boards are opaque JSON documents that the API only bounds. See `docs/workspaces.md` §6–7.
- **D19 Code runs in two places.** JavaScript and HTML + CSS run in the learner's browser (instant, no server
  load). Node.js, TypeScript and DSA run on our own small runner: one warm Docker container, `docker exec` per run
  (`internal/runner`). Self-hosted Judge0 was built first and removed: it needs cgroup v1 and a privileged worker,
  ships Node 12 / TypeScript 3.7, and we only need JS and TS. The cost of the own runner: the API needs the Docker
  socket, so it is dev-only until a safer deployment is chosen. The API, not the browser, scores server problems.
  See `docs/workspaces.md` section 5.
- **D18 Multiple-choice tests** (`docs/workspaces.md` §4). A global question bank per topic, generated
  ahead of time by the `cmd/kbgen` CLI and stored in the DB, so a test never waits on the AI. The topic
  list is code; "selected" topics are matched from the workspace's role and skills. Tests are timed by the
  server, answers are saved as chosen, and correct answers are revealed only after submit. A workspace is
  created from a resume (mandatory); its context is derived from the resume without AI. An earlier
  rounds-and-lessons knowledge base was dropped before release.
- **D17 Preparation workspaces** (`docs/workspaces.md`). Plans are user-owned: rules (and AI when
  configured) only suggest, and nothing is added without the user picking it. One plan per workspace.
  Activity `kind` (what) is separate from `progress` (`check`, `count`, `checklist`: how it completes);
  count progress is a row per completion with `(source, source_ref)` unique, so a future module's session
  counts once. Skill levels belong to the person (`user_skills`, stable slug keys) and are shared by
  all workspaces; `self_level` is never treated as verified and `demonstrated_level` is reserved for
  assessments. Optional modules are a validated text array; none is built yet, so the UI marks them
  "Planned". Context changes keep the previous version in `workspace_context_versions`. Workspace notes
  are plain text (not rich text) because rules and AI read them.
- **D16 Job match** (`/job-match`) ranks every resume against a pasted posting. The instant reading
  finds skills from a built-in dictionary with synonyms (`web/lib/resume/skills.ts`) and splits required
  from nice-to-have by the posting's headings. "Analyze with AI" asks the model for the requirements
  (with aliases) and rescores; scoring always runs in the browser, required items count double. The
  builder's Check panel uses the same instant matcher. AI analysis is meant to become a paid feature.
- **D15 Email verification gates writes.** New and existing users start unverified. Signup sends a
  48 h single-use link (`/verify-email?token=`); unverified users get a fresh link automatically at most
  once a day when the app loads (`GET /api/auth/me`), and can resend once a minute. `RequireVerified`
  guards every route that creates or changes data (resumes, versions, sharing, upload); reading,
  downloading and sharing pages stay available. The web app shows a banner and makes the builder read-only.
- **D14 Resume upload** sends the file to an LLM on OpenRouter (free models: Gemma 4 31B, then Nemotron 3.5
  Super as fallback) and maps the JSON into a new resume. PDFs use OpenRouter's free text-extraction plugin;
  DOCX text is extracted in Go. Files up to 3 MB, 10 uploads per hour per user, 90 s timeout.
  Parsing runs as an in-memory job that the browser polls every 2 s: a single request held for a
  minute was cut off (502) by the proxies in front of the API (Vercel, Cloudflare tunnel).
- **D13 Public addresses** (`resumes.slug`) are unique across all users (unique index); a clash
  returns a field error. Only lowercase letters, digits and dashes (DB check constraint).
- **D12 Third-party services behind ports** (Go interfaces) with a dev adapter and a test fake,
  e.g. `email.Sender` (`log` or `resend` via `EMAIL_PROVIDER`), `resumeparse.Parser` (`RESUME_PARSER_PROVIDER`).
