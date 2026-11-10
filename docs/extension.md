# Pypr job capture (Chrome extension)

A Manifest V3 extension in `extension/` that captures a job from an employer site into the Pypr tracker. Stack: WXT, React, TypeScript, Tailwind v4 (inside a Shadow DOM), Zod, `chrome.storage`, Vitest.

## What it does

- **Panel.** A full-height overlay on the right of the page (not Chrome's side panel). A floating launcher shows on pages that match a saved job layout. The toolbar icon opens the panel on any page.
- **Add this job.** Reads the page, shows an editable form, lists what is missing, and saves only when you confirm. Nothing is invented: a field that cannot be read stays empty.
- **Extraction order.** Your saved mapping, then schema.org `JobPosting` (arrays, `@graph`, several postings, malformed blocks), then a bundled ATS adapter, then generic page signals (labelled "guessed from page"), then manual entry.
- **Mapping.** Right-click an element, choose *Pypr → Use as → field*, or use *Pick on page* (hover highlight, click, Esc cancels, "select parent container"). Remapping a field replaces its selector. Editing a form value changes only the current job. *Save mapping* changes how future jobs on that page layout are read.
- **Page layouts.** A layout is a structured URL pattern such as `/job/view/:jobId`, optionally with required query parameters. No regular expressions. Subdomains match only if you tick the box. A new pattern needs an explicit "I checked" confirmation before it is saved.
- **Surely Remote** is a bundled site config on the same system. Its page structure is not known, so it ships with its host (`jobs.surelyremote.com`) and the job-page pattern `/job/view/:jobId`, with no field mappings; the pattern is an assumption to check, and you map the fields on first use.
- **Saving, applying.** *Save to Pypr*, *Open application page* and *I submitted my application…* are separate steps. Applied is set only after you confirm. Duplicates are checked by ATS + external ID, then normalised URL (strong), then company + title (weak warning); you can save as a new job anyway.

## Backend (already in the working tree, not deployed)

- Migration `backend/internal/db/migrations/00015_extension.sql`: `sessions.kind`, `extension_codes`, `tracked_jobs.client_key` (+ unique partial index).
- `backend/internal/auth/ext.go`: `POST /api/ext/authorize` (cookie session) and `POST /api/ext/token` (code + PKCE verifier). The auth middleware now also accepts `Authorization: Bearer`.
- Tracker create is idempotent through the `Idempotency-Key` header.
- Env: `EXTENSION_IDS` (comma separated extension IDs allowed to connect). Dev value: `ecfmagaellmkoicfndnhimjbjnlacfae`.
- Web: `/extension/connect` consent page.

Run the migration before the API that uses it (`goose up`, same as every other migration). Deploy backend and web before shipping an extension build to users.

## Commands

All inside `extension/`.

| Task | Command |
|---|---|
| Install | `pnpm install` |
| Dev (hot reload, uses `.env.development`: API `:8090`, web `:3000`) | `pnpm dev` |
| Type check | `pnpm typecheck` |
| Unit tests | `pnpm test` |
| Everything | `pnpm verify` |
| Production build (`.env.production`: `api.pypr.work`, `www.pypr.work`) | `pnpm build` -> `.output/chrome-mv3` |
| Distributable ZIP | `pnpm zip` -> `.output/pypr-extension-<version>-chrome.zip` |

## Load unpacked

1. `pnpm build` (or `pnpm dev`).
2. Open `chrome://extensions`, turn on *Developer mode*, click *Load unpacked*, choose `extension/.output/chrome-mv3` (dev: `.output/chrome-mv3-dev`).
3. The extension ID is fixed by the `key` in the manifest, so it is `ecfmagaellmkoicfndnhimjbjnlacfae` on every machine.

## Connecting an account

No passwords or tokens are typed into the extension. *Connect* opens the Pypr site through `chrome.identity.launchWebAuthFlow` (PKCE, redirect `https://<id>.chromiumapp.org/pypr`). You approve on `/extension/connect` while signed in to Pypr; the extension trades the one-time code for a session token kept in `chrome.storage.local` (trusted contexts only). The code is single use and expires quickly.

- **Local:** run the dev DB, API (`:8090`) and web (`:3000`). In `backend/.env` set `EXTENSION_IDS=ecfmagaellmkoicfndnhimjbjnlacfae`. Load the dev build.
- **Production:** set `EXTENSION_IDS` on the API host to the ID of the build you ship, then deploy the API and web. A ZIP built from this repo keeps the pinned ID. A Chrome Web Store listing gets its own ID unless the store is given the same key; add that ID to `EXTENSION_IDS` as well.

## Permissions

Install-time: `activeTab`, `scripting`, `storage`, `contextMenus`, `identity`, and one host permission, the Pypr API. Per site, on request: *Enable on this site* asks Chrome for that site's origin (`optional_host_permissions`) and a content script is registered for exactly the granted origins. No cookies, history, `webRequest` or remote code. Messages between parts are validated with Zod and checked by sender; there is no generic fetch proxy and the API origin is an allowlist.

## Tests and what was verified

**Automated (run in this repo):**
- `pnpm verify`: type check, 84 unit tests (extraction, JSON-LD, selectors, URL patterns, config resolution, storage, messages, auth, registration plan), production build. Passed.
- Go: `gofmt`, `go vet ./...`, `go test -p 1 ./...` (extension auth and idempotency tests need Docker Postgres; run packages one at a time). Passed.
- Web: `tsc --noEmit`, eslint on `app/extension`. Clean.
- Headless Chrome for Testing 157 (puppeteer, a test build that pre-grants `localhost` and `127.0.0.1`, real dev API and DB): 58 checks passed on three consecutive runs. They cover: panel geometry and single instance, right-click mapping and remap, parent selection, per-field saving, mapping persistence, launcher on matching pages only, saved-mapping extraction, broken-selector report and repair, edit retention across close/reopen and re-read, duplicate warning and save-as-new, per-site isolation, SPA navigation, schema.org extraction, persistence across a browser restart, account isolation, Applied only on explicit confirmation. A second script (9 checks) covers the consent page, code exchange, single-use code, non-allow-listed ID and the options pages.
- The E2E scripts live in the session scratchpad, not in the repo.

**Not automatable here, verify by hand:** the real Chrome permission prompt for *Enable on this site*, the real `launchWebAuthFlow` popup, the native right-click menu (the test calls the same handler directly), dark mode and very small windows, keyboard-only use with a screen reader, and Surely Remote (its HTML was never seen).

## Manual checklist

1. Load unpacked, open the options page, see built-in sites.
2. Connect from the panel; approve; the account email shows.
3. On a job page, toolbar icon opens the panel; Esc closes; launcher reopens it.
4. *Add this job*: missing fields listed; fill them; *Save to Pypr*; the job appears in the tracker as Saved, not Applied.
5. Right-click a title, *Pypr → Use as → Job title*, confirm; repeat for other fields; *Save mapping*.
6. Open another job on the same site: launcher appears, form fills from the mapping.
7. Break it: map a field to the wrong element, remap; check that the old selector is replaced.
8. *Enable on this site* on a new site: Chrome prompts; the launcher appears after approval without a reload; revoking the permission in `chrome://extensions` removes it.
9. Save the same job twice: duplicate warning shows the reason.
10. *I submitted my application…* then *Yes, I applied*: status becomes Applied only now.
11. Sign out, sign in as another account: no mappings or drafts from the first.
12. Surely Remote: enable, open a job, map fields, save.

## Known limitations

- Content inside iframes and shadow DOM is not read; the panel says so when a page looks empty.
- Selectors can break when a site redesigns; the panel reports which field failed and offers remapping.
- Mappings are per account and per browser profile; there is no cross-device sync or sharing.
- Salary and work arrangement are parsed only when stated explicitly.
- Chrome decides when a granted permission is revoked; the extension re-syncs its registration on startup and on permission changes.
- Not published to the Chrome Web Store. Not covered: autofill, auto-submit, email, history, AI extraction.
