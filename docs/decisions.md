# Decision log

Decisions approved on 2026-10-20. Add new entries at the end; don't rewrite old ones.
If a decision changes, add a new entry that replaces it.

## D1. Start fresh, port selectively

The repo was empty. An earlier attempt (`../prpr-old/pypr-ui`) had a similar shape but was early,
had uncommitted work, mixed package scopes and used bcrypt and `prisma db push`. We start clean
and copy ideas from it (schema conventions, Zod section model) by hand. The old repo isn't changed.

## D2. pnpm workspaces + Turborepo

pnpm gives strict dependency isolation and `workspace:*` links. Turborepo handles task order and
caching. There's no custom build system. Shared packages build to `dist/`, so the Next.js and
NestJS toolchains both consume plain ESM.

## D3. Resume persistence: hybrid relational + validated JSONB (planned, milestone 6)

- `resumes`: owner, title, template, `schema_version`, `revision`
- `resume_basics`: typed columns (name, headline, contact details, summary)
- `resume_sections`: id, type, title, position, visibility
- `resume_entries`: id, section id, position, `data jsonb`

Entry `data` is validated on the server against the Zod schema for its section type before every write.

- **Why:** stable ids, foreign keys and ownership at the row level, without 8+ entry tables. A new
  entry field doesn't need a database migration, and saving a whole resume is one small transaction.
- **Cost:** the database doesn't enforce the shape of `data`.
- **Mitigations:** mandatory server-side validation, `schema_version` with upgrades in code, and
  typed or generated columns later if a real query (such as recruiter search) needs them.
- **Saves:** the client sends the whole document with its `revision`. The server updates rows by
  id and deletes removed ones in one transaction. A stale `revision` returns 409.
- **Creates:** a resume is created only by an explicit `POST` with an idempotency key.

## D4. Authentication (planned, milestones 3–4)

- **Passwords:** argon2id via `@node-rs/argon2`, which ships prebuilt binaries with no install scripts.
- **Access token:** a JWT that lasts about 15 minutes, holding only the user id and session id,
  in an `HttpOnly; Secure; SameSite=Lax` cookie.
- **Refresh token:** a random opaque value that lasts about 30 days. Only its SHA-256 hash is stored
  in `sessions`. The cookie is limited to `/api/auth`, and the token is replaced on every refresh.
  Reusing an old token revokes the whole session family.
- **Other:** `identity_providers` keeps OAuth (LinkedIn) possible later; only local auth is built.
  Requests that change data need an allowed `Origin`, auth routes are rate-limited, and logs redact
  sensitive fields.

## D5. Same-site deployment for cookies

The web app and API share a site: the Next.js `/api` proxy in development, and subdomains such as
`app.` and `api.` in production. This keeps `SameSite=Lax` cookies working without third-party cookies.

## D6. Local PostgreSQL via Docker

`docker-compose.yml` will run Postgres with separate dev and test databases. Supabase stays the
hosting target. Only migrations change the schema (`prisma migrate`). There are no reset or
`db push` scripts, and nothing destructive runs without explicit approval.

## D7. Server-side PDF with headless Chromium (planned, milestone 10)

The API renders the same React template the preview uses to static HTML with print CSS, and prints
it with Playwright's Chromium.

- **Why:** preview and PDF match, full CSS for typography, and real pagination controls
  (`break-inside`, `@page`).
- **Rejected alternative:** `@react-pdf/renderer` is lighter but supports only part of CSS and
  would need a second layout for the preview.
- **Cost:** the API needs a container host with Chromium, not strict serverless.

## D8. ESLint 10 without `eslint-config-next` (milestone 2)

`eslint-config-next` 16.3 bundles `eslint-plugin-react`, `eslint-plugin-jsx-a11y` and
`eslint-plugin-import`, which don't support ESLint 10. `eslint-plugin-react` crashes on load
(`getFilename is not a function`). ESLint 9 would work but is end-of-life.

So the web app uses ESLint 10 with `@next/eslint-plugin-next` (core-web-vitals) and
`eslint-plugin-react-hooks` 7 directly, on top of the shared strict TypeScript config.

- **Lost for now:** jsx-a11y accessibility lint and a few `eslint-plugin-react` rules such as `jsx-key`.
- **Mitigation:** automated accessibility checks (axe) in the end-to-end tests (milestone 11).
- **Revisit:** add `eslint-config-next` back once its bundled plugins support ESLint 10.

## D9. Refresh tokens in their own table (milestone 3, refines D4)

D4 said the refresh token hash is stored in `sessions`. To detect reuse of _any_ earlier token in a
family, not only the last one, the hashes live in `refresh_tokens` instead:

- `sessions`: one row per sign-in (device or browser). Its id goes in the access token. Setting
  `revoked_at` ends the session and every token issued for it.
- `refresh_tokens`: every token issued for a session, as hex SHA-256 (`CHECK`ed). Refreshing sets
  `used_at` on the presented token and issues a new one. Presenting a token that already has
  `used_at` revokes the session.
- Passwords are a nullable `users.password_hash`, so accounts that only use a provider (later) need
  no password row. Emails are stored lowercased, enforced by a `CHECK` constraint.

## D10. Dark theme by default, switcher in Settings (milestone 3)

The landing page design comes from the earlier `pypr-ui` project. Dark is the default theme; users
can pick Light or System in `/settings`.

- The preference is kept in `localStorage`. An inline script in `<head>` applies it before first
  paint, following the bundled Next.js guide "Preventing flash before hydration". Reading a cookie
  on the server instead would make every page dynamic.
- No theme library: the logic is ~40 lines and covered by tests, including the inline script.
- The settings page is public for now and moves into the signed-in dashboard in milestone 7.

## D11. Development runs against Supabase; tests stay local (milestone 3, refines D6)

The project's Supabase database (the one the earlier attempt used) is now Pypr's own database.
On 2026-10-20 its old tables were dropped, after a JSON backup of their few rows, and the first
migration was applied with `prisma migrate deploy`. Supabase's own schemas (`auth`, `storage`, ...)
were not touched.

- `apps/api/.env` points `DATABASE_URL` at Supabase's direct connection (IPv6, port 5432), which
  Prisma Migrate needs.
- Tests keep using the local Docker database `pypr_test`. `test/global-setup.ts` refuses databases
  not named `*_test`, so tests can't write to Supabase. `pypr_dev` in Docker stays available offline.
- TLS: `sslmode=require&uselibpqcompat=true` encrypts but doesn't verify the server certificate.
  Before production, add Supabase's CA certificate and switch to `sslmode=verify-full`.
- D6 still holds: only migrations change the schema, and nothing destructive runs without explicit
  approval (this reset was approved by the project owner).

## D12. Auth implementation details (milestone 4)

How D4 and D9 were built, and the trade-offs taken:

- **Libraries:** `jose` for JWTs (HS256, issuer `pypr-api`, audience `pypr-web`, algorithm pinned
  on verify), `@node-rs/argon2` (argon2id, 19 MiB, 2 passes), `@nestjs/throttler`, `cookie-parser`.
- **Deny by default:** a global guard; public routes opt out with `@Public()`. The guard also
  checks the session row, so logout and reuse revocation apply to access tokens at once.
- **Passwords:** 10–128 characters, no composition rules (NIST SP 800-63B). Login takes the same
  time for unknown emails (it verifies against a dummy hash) and gives one message for both cases.
- **Account enumeration:** register answers 409 for an email that exists. Without email
  verification there is no way to hide that, so we accept it and rate-limit instead.
- **Refresh reuse:** strict, with no grace period. Two refreshes racing with the same token end the
  session (one succeeds, then the second looks like reuse). The web client (milestone 7) must send
  one refresh at a time.
- **Origin check:** data-changing requests without an `Origin` header are rejected, not only
  foreign ones. Browsers always send it; curl and scripts must add it.
- **Cookies:** `Secure` everywhere except `NODE_ENV=development` (plain http on localhost).
- **Rate limits:** 10 requests a minute per IP on auth routes (refresh 30), kept in memory. That is
  correct for one API instance; with several, move the counters to a shared store. Per-account
  lockout is not built.
- **Later:** a job to delete expired refresh tokens and old revoked sessions.

## D13. Third-party services behind adapters (milestone 4)

Every third-party integration follows the adapter pattern, starting with email:

- A **port** owned by the app: an abstract class in `src/integrations/<kind>/` (e.g. `EmailSender`)
  that is also the Nest injection token. Domain code depends only on the port.
- One **adapter** per provider (e.g. `ResendEmailSender`); only the adapter imports the SDK, and it
  turns provider errors into app errors (`EmailDeliveryError`) without message contents.
- A **local adapter** for development (`ConsoleEmailSender`) and a **test fake**
  (`InMemoryEmailSender`). Env config picks the adapter; production refuses the local one.
- Why: providers can be swapped or mocked without touching domain code, and tests never call out.

## D14. Email verification required before sign-in (milestone 4, refines D12)

- Register creates the account unverified, stores a one-time token (SHA-256 only, 24 hours) in
  `user_tokens`, and emails a link to `APP_URL/verify-email`. It doesn't sign in.
- Opening the link and clicking "Verify my email" consumes the token, voids the user's other links,
  marks the email verified and signs in. The page doesn't verify on load, because email security
  scanners open links automatically. It drops the token from the URL and sends no referrer.
- Login answers 403 `EMAIL_NOT_VERIFIED`, only after a correct password.
- A taken email answers 409 `EMAIL_ALREADY_REGISTERED`, and the web app sends the user to the
  login screen (product decision; the enumeration trade-off from D12 stands).
- `resend-verification` always answers 202 and sends at most one link a minute per account.
- If the email can't be sent, register deletes the new account and answers 503, so a retry works.
- Sender: `EMAIL_FROM` on `pypr.work`. The domain has to be verified in Resend before
  `EMAIL_PROVIDER=resend` can send; until then local development uses the console adapter.

## D15. Hand-written UI primitives instead of shadcn/ui (milestone 7)

The architecture planned shadcn/ui for milestone 7. Its generator brings its own color variables
(`--background`, `--primary`, …) that would duplicate our tokens, plus Radix and helper
dependencies. The app needed five primitives, so they are hand-written in the same style on our
tokens: `Button`, `Field`/`TextAreaField`, `Alert`, `Dialog` (native `<dialog>`, which provides
focus trapping and Escape), and `IconButton`.

- **Revisit** if we need complex widgets (combobox, menus, date pickers); add Radix primitives
  then, still styled with our tokens.

## D16. PDF rendering behind an adapter (milestone 10, implements D7)

Following D13, PDF rendering is a port (`PdfRenderer`) with a Playwright adapter and a test fake.
One Chromium is shared; each render gets a fresh context with JavaScript disabled and all
network requests blocked, a concurrency limit (`PDF_CONCURRENCY`) and a timeout
(`PDF_TIMEOUT_MS`). The page size comes from the template's `@page` rule (A4 or Letter).
`playwright-core` is used so installs don't download browsers; the Docker image installs the
headless shell and fonts.

## D17. End-to-end tests against real builds (milestone 11)

`apps/e2e` runs Playwright against the built API and a separate production build of the web app
(`NEXT_DIST_DIR=.next-e2e`) on ports 4100/3100, using the `pypr_test` database. Emails go to the
`outbox` email adapter (JSON files; refused in production), where tests read the verification
link. PDFs use the real Chromium. Each test sends its own `X-Forwarded-For`, which the API trusts
from the loopback proxy, so tests don't share rate limits. axe checks WCAG 2.1 A/AA on every main
page (the D8 mitigation). `pnpm e2e` runs them; they're not part of `pnpm verify`.

## D18. Security review outcomes (milestone 11)

See [security.md](security.md). Changes made: a global exception filter that logs unexpected
errors without request data, web security headers (CSP, frame denial, HSTS…), and a dark-theme
contrast fix. Open items, with priorities, are tracked at the end of security.md.

## D19. Sending domain send.pypr.work (refines D14)

Emails are sent from `Pypr <no-reply@send.pypr.work>`. The subdomain is verified in Resend
(2026-10-20) and keeps sending reputation separate from `pypr.work`. Local development now uses
`EMAIL_PROVIDER=resend` too; tests still use the in-memory and outbox adapters and never send.

## D20. Theme follows the OS by default; navbar light/dark toggle (replaces D10's default)

- With no saved choice, the theme follows the operating system (preference `system`), including
  live OS changes. D10 made dark the default; the product owner changed that on 2026-10-20.
- The landing and auth navbars have a theme toggle (Sun/Moon for the theme on screen). One click
  switches to the other theme and saves it in the same `localStorage` key; it wins over the OS
  from then on. (A two-item menu was tried first; with only two options a toggle is quicker.) The Settings page keeps its three options, so a user can go
  back to following the OS.
- The signed-out landing navbar no longer links to Settings; signed-in users reach it from the
  app header.
- The server still renders `data-theme="dark"`; the head script picks the real theme before
  first paint, so pages without JavaScript are dark.

## D21. Signed-in app shell with a sidebar (2026-10-20)

Signed-in pages use a sidebar layout modelled on ChatGPT's (layout only; Pypr's own branding):

- **Sidebar:** full height, Resumes in the main navigation (active on `/dashboard` and
  `/resumes/*`), Settings anchored at the bottom. Collapses to icons on desktop; the choice is a
  per-browser convenience in `localStorage`. Below the `md` breakpoint it becomes a drawer (a
  native modal `<dialog>`), so it never takes width on phones.
- **Header:** only the mobile menu button and the account menu (initials avatar → email,
  Settings, Sign out through the existing logout). No navigation duplicated in the header.
- **Main area:** fills the rest of the viewport and scrolls on its own; pages keep their content.
- **Settings** moved into the signed-in area (same URL), so it now needs sign-in. Signed-out
  visitors change the theme with the navbar toggle (D20).
- Public pages (landing, sign in, sign up, verify email) keep the public layout and never show
  the sidebar.

## D22. AI resume import through a parser adapter; OpenRouter with gpt-4.1-mini (2026-10-20)

**Flow.** `POST /api/resume-imports` (multipart, 5 MB, PDF or DOCX checked by file bytes) →
text extraction in memory (`unpdf` for PDF, `mammoth` for DOCX) → text normalized and capped at
60k characters → `ResumeParser` port → strict schema validation (`parsedResumeSchema`) →
normalization into `ResumeContent` (fresh UUIDs, dates as `YYYY-MM`/`YYYY`, limits, empty items
dropped, unknown sections become custom sections) → `resumeContentSchema` check. The response is
returned **without saving**. The user reviews it and creates the resume with the normal
`POST /api/resumes { title, content }` (idempotency key), so failures and cancels create nothing.

**Files are never stored.** Multer keeps the upload in request memory only (no disk, no database,
no object storage); logs record only error kinds, model, latency and token counts — never text.

**Scans.** Under 80 letters/digits of text is treated as "no text" (`NO_TEXT_FOUND`) and the
parser is not called; there's no OCR.

**Adapter (D13).** `ResumeParser` with `OpenRouterResumeParser` (plain `fetch`), a
`DisabledResumeParser` (default when not configured) and a test fake. Provider errors map to
`rate_limited | timeout | unavailable | not_configured | invalid_output`, then to HTTP
503 `PARSER_BUSY` / 503 `PARSER_UNAVAILABLE` / 422 `UNPARSEABLE_RESUME`. Requests use JSON-schema
structured output with `strict: true`, `temperature: 0`, and provider routing
`require_parameters: true, data_collection: "deny"` (only providers that support the schema and
don't retain or train on prompts). The prompt says to never invent data and to treat the resume
text as data, not instructions.

**Model.** Verified on 2026-10-20 against `https://openrouter.ai/api/v1/models` and each
model's `/endpoints` (all listed support `structured_outputs`):

| Model                        | $/M in | $/M out | Context | Notes                                                                                                          |
| ---------------------------- | ------ | ------- | ------- | -------------------------------------------------------------------------------------------------------------- |
| **openai/gpt-4.1-mini**      | 0.40   | 1.60    | 1M      | Chosen. Strict schema enforced on every provider (OpenAI, Azure); mature (2025-04); no reasoning step, so fast |
| google/gemini-3.1-flash-lite | 0.25   | 1.50    | 1M      | Cheaper; one Google endpoint at 87% uptime that day                                                            |
| anthropic/claude-haiku-5.5   | 0.10   | 0.50    | 1M      | Cheapest, but released 2026-10-07; some providers lack structured outputs                                      |
| openai/gpt-5.4-mini          | 0.75   | 4.50    | 400k    | Stronger, ~2.4× the cost per import                                                                            |

A typical import (~4.5k input, ~2k output tokens) costs about $0.005 with gpt-4.1-mini.
Configure with `RESUME_PARSER_PROVIDER=openrouter`, `OPENROUTER_API_KEY`,
`OPENROUTER_RESUME_MODEL` (default `openai/gpt-4.1-mini`), `RESUME_PARSER_TIMEOUT_MS`.
Re-check availability and prices before changing the default.

## D23. Editor layout, unique standard sections, drag-and-drop ordering (2026-10-20)

- **Layout.** The editor fills the shell's main area: a form panel with **Form / Templates** tabs
  (each scrolls on its own) and the live preview beside it; small screens switch between them.
  Its controls (Back to resumes, name, Download) render in the shell header through
  `AppHeaderSlot`, so there's one header row and the account menu stays put. Templates holds the
  existing template picker; no new template features.
- **Back to resumes** saves first; if something can't be saved (invalid fields, conflict,
  offline) it asks before leaving.
- **Accordions.** Personal details and every section collapse independently (state kept by id, so
  reordering doesn't reset it); collapsed headers show the title and entry count.
- **Unique standard sections.** Each standard type (experience, education, skills, projects,
  certifications, awards, languages) at most once; custom sections unlimited. Enforced by
  `resumeContentSchema` (so the API rejects duplicates), `canAddSection`/`addSection` in
  `resume-core`, and the Add section menu. **Schema version 2** adds the rule; its upgrade step
  merges duplicate standard sections of older resumes into the first one, keeping all entries
  (no database migration). Version 2 also accepts year-only dates (`"2021"`) so imports never
  invent months; date fields became text inputs (`YYYY-MM` or `YYYY`).
- **Ordering.** Sections reorder by drag and drop with `@dnd-kit` (already used by the legacy
  project): a grip handle only (fields never start a drag), a 5 px pointer threshold, keyboard
  support (Space, arrows, Space/Escape) and spoken announcements. The up/down arrows for sections
  were removed; entries keep theirs. Order persists through the normal autosave.
- **Dashboard card** adapted from pypr-old's `ResumeCard` (thumbnail with Edit/Download on hover,
  modified/created dates, headline); Download gives the PDF instead of the legacy JSON, and the
  current Delete action is kept. The resume list API gained `createdAt` and `headline`.

## D24. Theme and font follow OpenRouter's app (2026-10-20)

At the product owner's request, the web app's colors and interface font follow OpenRouter's app
theme, read from openrouter.ai's stylesheets on 2026-10-20:

- **Neutrals** (zinc): light canvas/surface `#ffffff`, sidebar `#fafafa`, text `#09090b`,
  muted `#71717a`, borders `#e4e4e7`; dark canvas `#090a0b`, surface/sidebar `#09090b`, text
  `#dfe1e2`, muted `#a1a1aa`, borders `#3d3d42`. Secondary fills `#f4f4f5` / `#27272a`.
- **Primary** indigo: OpenRouter's `#6467f2` is the accent; filled buttons use `#5b5df1`
  because white text on `#6467f2` is 4.24:1, under WCAG AA. Light-mode error red is `#db2424`
  instead of `#ef4444` (3.76:1 on white) for the same reason; dark mode keeps `#ef4444`.
- **Font:** Plus Jakarta Sans (open source, via `next/font`) for all interface text. OpenRouter's
  brand font (Gordita) is commercial and licensed to them, so it isn't used; Pypr's logo keeps
  Space Grotesk, and resume templates keep their own print fonts.
- New tokens: `primary`, `primary-ink`, `secondary`, `sidebar`, `warning`. Buttons: primary is
  indigo, secondary a gray fill. Pypr keeps its own name and logo.

## D25. Vercel-inspired workspace, resume design settings, rich text (2026-10-20, replaces D24's palette)

**Look.** The app's tokens follow a Vercel-inspired developer palette (dark is the CSS default):
canvas `#090B10`, panels `#11151D`, elevated `#191D25`, borders `#272D37`, text `#F4F7FA` /
`#A1A8B5` / `#8993A3`, neon-lime primary `#B7FF3C` with dark text. Light mode keeps lime as a
fill (dark text) but uses ink for thin indicators (focus rings, selected tabs) through a new
`highlight` token, because lime lines are invisible on white. New `elevated` token for menus and
dialogs. Interface font: Geist (Vercel's open-source typeface); the logo keeps Space Grotesk.
The resume editor hides the app sidebar (focused workspace); other pages keep it.

**Resume settings.** `content.settings = { accentColor, font, density }` in `resume-core`
(defaults `#B7FF3C`, `helvetica`, `normal`; content without settings gets the defaults). Stored in
three new `resumes` columns (`accent_color` CHECKed as uppercase hex, `font`, `density` enum) by
an additive migration with defaults, so existing resumes need nothing. Saved with the normal
autosave and revision check; validated by Zod on the server.

- The editor recolors **only itself** with the resume's accent (`.resume-accent-scope`), using
  contrast-safe variants: readable text on the accent, and thin indicators at ≥ 3:1 on each
  theme. The app's own accent elsewhere stays lime.
- The Classic template uses the accent for section headings, dividers and bullet markers,
  darkened to 4.5:1 (text) and 3:1 (lines) against white paper, so any accent prints readably.
- Fonts are system font stacks (Helvetica/Arial, System UI, Verdana, Georgia, Palatino, Times):
  the preview and PDF can't load web fonts by design. The PDF server falls back to Liberation /
  DejaVu fonts where the named font isn't installed.
- Density: Compact / Normal / Spaced scale line height and every vertical gap (Normal = the
  original rhythm).
- The PDF renders from the same HTML, so it follows accent, density and font family (verified
  with an API test and a real Chromium render).

**Rich text.** Summaries use a Tiptap 3 editor (bold, italic, bulleted and numbered lists;
everything else disabled). Stored as a small Markdown subset in the existing string fields
(`resume-core/rich-text.ts`), so plain text from before or from imports is already valid and no
content migration was needed. Templates parse it into React elements; no HTML is stored or
injected. Literal `*` is escaped.

**Templates tab.** One real template card with a live thumbnail of the user's resume, a
"Selected" badge (icon + text), then the design settings: accent swatches (Neon lime, Electric
violet, Cyan, Blue, Coral, Amber, Pink) plus Custom (color picker + validated hex), font,
density.

## D26. API on the home server behind the existing Cloudflare Tunnel (2026-10-20)

- **Repository:** the code lives in `github.com/kapilkumar-github/pypr` (renamed from
  `pypr-ui`). `main` is the new codebase (fast-forwarded on top of the old main, no force
  push), `main-old` keeps the previous main (`6900695`), `dev` follows `main`; `qa` and `staging`
  were deleted after confirming they held no unique commits.
- **Runtime:** Docker Compose on the home server with host networking, bound to
  `127.0.0.1:8081`, which the already-running Cloudflare Tunnel routes `api.pypr.work` to. No
  router or Cloudflare change was needed. Host networking also gives the container the server's
  IPv6, so it uses Supabase's direct (IPv6-only) host.
- **Images** are built on the Mac and copied over SSH, tagged with the commit; no registry and no
  GitHub credentials on the server. `scripts/deploy-api.sh rollback` swaps to the previous tag.
- **Secrets** sit only in `~/pypr-api/api.env` (600). The production JWT secret was generated on
  the server and differs from development.
- **Proxy chain:** browser → Vercel (`pypr.work` rewrite) → Cloudflare → tunnel → API, so
  `TRUST_PROXY=2`. Known gap: someone calling `api.pypr.work` directly can put a fake
  `X-Forwarded-For` first and dodge per-IP rate limits. Fix later with Cloudflare rate limiting
  or a shared header that only the Vercel rewrite sends.
- The old Go backend (`pypr-api.service`, `~/pypr-go`) is retired: it should be disabled; its
  files stay until the owner approves removing them.

## D27. Separate production database (2026-10-21)

Production uses its own Supabase project, `uwrdwxmlyylkfdboxsuw` (the database the old Go backend
used); development and tests keep `aahaqtbsshzmgukfrnig` and local Docker. Before going live the
production project's `public` schema was emptied (the old app's 13 tables, its goose history and
all types/functions; no backup, at the owner's request; Supabase's own schemas untouched) and
the 4 Prisma migrations were applied with `prisma migrate deploy`, with no drift afterwards.
The old Go instance (`~/pypr-go`) was deleted; its systemd unit still needs `sudo` to remove.

## D28. Resume photos, generic links, app appearance, automatic verification (2026-10-20)

Approved by the product owner before milestones 12–17.

- **Photos** live in a `resume_photos` table in Postgres (one per resume, deleted with it), never
  in the resume content. The API decodes every upload with `sharp` and stores a re-encoded JPEG
  (at most 800 px), so only real JPEG, PNG or WebP images get in and EXIF/GPS data is dropped.
  No object storage account is needed yet; if photos move to R2 or Supabase Storage later, the
  bytes go behind a storage port (D13) and the table keeps the metadata.
- **Links.** A Websites & Profiles section (`links`, a unique standard type; any number of
  label + URL entries, no fixed platform list) replaces the fixed Website, LinkedIn and GitHub
  fields. URLs must be web addresses (`example.com` or `http(s)://…`); other schemes are refused,
  never rewritten; templates add `https://` to bare domains when linking. Classic prints the label
  and the address, so links work on paper and are clickable in the PDF. **Schema version 3**
  moves existing values into that section, placed first (a value that isn't a web address
  becomes the label, so nothing is lost); the section limit went from 20 to 21 so this always
  fits. Imports use the same rule. The old `resume_basics` columns got empty defaults, are
  ignored from version 3 on and blanked on the next save; a later migration can drop them.
  The AI parser returns a generic `links` list (label + URL as written, any platform) instead of
  three fixed fields; an address that isn't a web address is kept in the label, never linked.
- **Add section** (milestone 14) is a two-column grid of buttons, one per section type with an
  icon, replacing the select + Add button. Standard types already on the resume are disabled with
  "Added" (a check mark alone on phones); Custom section spans the row and is unlimited. New
  sections go to the end, scroll into view and get focus. Duplicate clicks can't add a standard
  type twice (`canAddSection`), and autosave retries can't duplicate rows (client ids, D3).
- **App appearance is per account:** `users.theme_preference` and `users.app_accent_color`
  (nullable: null = never chosen), `GET/PATCH /api/me/appearance` (PATCH changes only the fields
  sent). The browser caches both; the `<head>` script applies the theme and the accent's
  `--app-*` CSS variables (allow-listed names and hex/rgb values only) before first paint. After
  sign-in, the account's values apply unless this browser changed one since the last sync or the
  account never had one; then the browser's value is saved, so existing choices survive.
  The theme tokens read `var(--app-accent, #b7ff3c)` etc.; a custom accent gets readable text
  and ≥ 3:1 indicator shades per theme; the default lime keeps D25's tuned values.
- **Separate from resume design.** This replaces D25's "the editor recolors itself with the
  resume's accent": the editor now uses the app accent; a resume's accent, font and density only
  affect that resume's preview and PDF. The shared `AccentPicker` serves both (Settings and the
  editor's Templates tab), each with its own value and sample.
- **Settings** (milestone 16): `/settings` opens `/settings/appearance`; a category list on the
  left (a strip on phones) with only Appearance for now, the panel on the right. Accent changes
  apply at once and save after 400 ms of quiet; a failed save says it will sync later.
- **Email verification runs on page load** (replaces D14's click). The page sends one request
  per token for its lifetime (shared across React remounts), shows "Verifying your email…", and
  on success goes to `/dashboard`. Errors: `INVALID_TOKEN` (wrong or used), new
  `VERIFICATION_LINK_EXPIRED` (offer a new link), new 409 `EMAIL_ALREADY_VERIFIED` (a used or
  expired link whose email is verified: the page goes to the resumes when already signed in,
  else offers sign-in; no session is ever started from a used link). Network, 429 and 5xx
  failures offer Try again. Single use, expiry, hashing and voiding of older links are unchanged.
  Trade-off: an email scanner that runs JavaScript can now use the link first; the user then sees
  "already verified" and signs in with their password.
