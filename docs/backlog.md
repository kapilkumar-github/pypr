# Backlog

Known limitations, caveats and deferred work. Newest first within each group.

## Deployment

- **Set `BACKEND_URL=https://api.pypr.work` on the Vercel project and redeploy.** Until then
  `www.pypr.work/api/*` fails (`DNS_HOSTNAME_RESOLVED_PRIVATE`: the default points at localhost), so
  sign-in, the builder and server PDFs don't work on the live site.
- **Disable the old `pypr-api.service` on the home server** (`sudo systemctl disable --now pypr-api`).
  It points at a missing `/home/kapil/pypr-go` directory and restarts every 5 s; it doesn't bind a port.
- **Remove the old Node API** (`~/pypr-api`, container `pypr-api`, stopped, `pypr-api:*` images,
  about 1.5 GB each) once the Go API has proven itself. Kept for rollback:
  `docker compose -f ~/pypr-go-api/compose.yml down && docker compose -f ~/pypr-api/compose.yml start api`.
- **Chrome runs without its sandbox** in the API container (`CHROME_NO_SANDBOX=true`, all capabilities
  dropped). It only opens `APP_URL`. Revisit with a seccomp profile that allows the sandbox.

## Security

- **Rotate the Supabase database password, the OpenRouter key and the Resend key.** All were pasted in
  a chat; they're still in use (`backend/.env`, `~/pypr-go-api/api.env` on the server).
- **A failed verification email is retried only after a day** (or when the user presses Resend): the
  link is stored before sending, so the daily auto-send sees it as sent. Two tabs opening at once can
  send two links. Both links work.
- **Existing users must verify before editing.** Each gets a link the next time they open the app.

## Scaling (single instance assumptions)

- Rate limiters (login, reset, PDF) are in memory, per process.
- PDF render tokens are signed with a key generated at start-up, so the API that mints a token must
  also serve `GET /api/render/resumes/{id}`. Use a shared secret before running more than one instance.
- PDF rendering is capped at 3 at once per process; the first render after start-up is slower
  (Chrome cold start, a few seconds).

## Resume builder

- **Resume upload depends on free OpenRouter models.** They're rate limited and slow at busy times
  (22–70 s seen); the API gives up after 90 s. Results can miss or misplace details, so users should
  review the imported resume. Scanned (image-only) PDFs and old `.doc` files aren't supported.
- **The uploaded file is sent to OpenRouter and the model provider** to be read; it isn't stored by pypr.

- **Public page for an unknown address returns HTTP 200** with the not-found page and `noindex`
  (Next streams the page before `notFound()` runs inside Suspense). Crawlers won't index it, but
  the status isn't 404.
- **View counts include the owner's own visits.**
- **Job match counts words, not meaning.** It compares the posting's most frequent terms with the
  resume text; synonyms and phrasing aren't recognized. It doesn't update as you edit.
- **Parser view is a simulation** built from the resume data, not text extracted from the PDF.
- **ATS checks are rule-based** (26 rules). The score measures readability by software, not fit for a job.
- **Word export is HTML saved as `.doc`**, not a native `.docx`; layout is simplified.
- **PDF reflects the saved resume.** The builder saves pending edits first; if the title is empty the
  save can't run and the download stops with a message.
- **The document-menu "Print" still uses the browser print dialog**, so its output can differ
  slightly from the server PDF (browser fonts and print engine).
- **Version history has no diff view**; autosave versions are one per editing session (30 min gap),
  kept 90 days, at most 50 per resume.

## Deferred features

- Multiple roles under one employer ("Add role").
- AI writing assistant and writing review.
- QR code for the public page.
- Password-protected public links.
- Custom domains for public pages.
- Custom CSS.
