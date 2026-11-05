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
- **D15 Email verification gates writes.** New and existing users start unverified. Signup sends a
  48 h single-use link (`/verify-email?token=`); unverified users get a fresh link automatically at most
  once a day when the app loads (`GET /api/auth/me`), and can resend once a minute. `RequireVerified`
  guards every route that creates or changes data (resumes, versions, sharing, upload); reading,
  downloading and sharing pages stay available. The web app shows a banner and makes the builder read-only.
- **D14 Resume upload** sends the file to an LLM on OpenRouter (free models: Gemma 4 31B, then Nemotron 3.5
  Super as fallback) and maps the JSON into a new resume. PDFs use OpenRouter's free text-extraction plugin;
  DOCX text is extracted in Go. Files up to 3 MB, 10 uploads per hour per user, 90 s timeout.
- **D13 Public addresses** (`resumes.slug`) are unique across all users (unique index); a clash
  returns a field error. Only lowercase letters, digits and dashes (DB check constraint).
- **D12 Third-party services behind ports** (Go interfaces) with a dev adapter and a test fake,
  e.g. `email.Sender` (`log` or `resend` via `EMAIL_PROVIDER`), `resumeparse.Parser` (`RESUME_PARSER_PROVIDER`).
