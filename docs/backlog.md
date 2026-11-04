# Backlog

Known limitations, caveats and deferred work. Newest first within each group.

## Deployment

- **Deploy the API to the home server at `api.pypr.work`.** Blocked on 2026-11-05: `homeserver`
  (192.168.1.11) didn't answer on the LAN and `wizard` was offline on Tailscale, so the Cloudflare Tunnel
  for `api.pypr.work` had no origin (HTTP 530). When it's back: stop whatever serves that hostname,
  build `backend/cmd/api` for the server, run it with the current `DATABASE_URL`, and point the tunnel at it.
- **Server PDF needs the web app reachable from the API host.** Chrome on the API host opens
  `APP_URL/print/{id}`. In production `APP_URL` must be the deployed web app, and Chrome (or Chromium)
  must be installed on the API host.
- **The web app isn't deployed yet.** It needs `BACKEND_URL` pointing at the API.

## Security

- **Rotate the Supabase database password.** It was pasted in a chat; it's still in use.
- **Password reset emails aren't sent.** Only the `log` email adapter exists; add a real provider
  (e.g. Resend) behind `email.Sender`.

## Scaling (single instance assumptions)

- Rate limiters (login, reset, PDF) are in memory, per process.
- PDF render tokens are signed with a key generated at start-up, so the API that mints a token must
  also serve `GET /api/render/resumes/{id}`. Use a shared secret before running more than one instance.
- PDF rendering is capped at 3 at once per process; the first render after start-up is slower
  (Chrome cold start, a few seconds).

## Resume builder

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
