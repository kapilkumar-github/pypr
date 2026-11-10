# Job tracker

Save a job, prepare a resume, apply on the employer's site, track progress, prepare for interviews.
The tracker works the same whatever site the application goes through (company site, Workday,
Greenhouse, Lever, Workable…): Pypr never submits anything and never reads a user's ATS accounts.

Saving a job, opening its application page and submitting the application are separate actions.
Opening the link changes nothing. The user confirms they applied ("I applied", or picking Applied in a
status control the first time), which records the applied date and the resume used.

## Data (`backend/internal/db/migrations/00014_job_tracker.sql`)

| Table | Holds |
|---|---|
| `tracked_jobs` | Job fields, `status`, `applied_at`, selected `resume_id` (set null when the resume is deleted), next action (`next_action`, `next_action_due` date, `next_action_done_at`), duplicate keys (`url_keys`, `match_key`) |
| `job_status_events` | Every status change (`from_status` null on creation) |
| `job_resume_snapshots` | Resume used for the application. `kind` pypr (title + full data copied, including template and design settings), external (a label) or none. `at_submission` marks the record made when applying (one per job); later records are "added after applying". A trigger refuses edits, except the resume link going null on deletion |
| `job_notes` | Timestamped notes |
| `job_interviews` | One row per round: name, `scheduled_at` (UTC), IANA `timezone`, meeting link, notes |

All rows hang off `tracked_jobs.user_id`. Every query filters by the session user; nested rows are
reached only through a job locked with `id and user_id`. Resume IDs are checked against the user.

## Rules

- Statuses: saved, preparing, applied, interviewing, offer, accepted, rejected, withdrawn, closed. Any
  move is allowed, except that the first move to applied goes through the apply confirmation
  (`409 apply_confirmation_required`).
- Apply confirmation is one transaction: lock the job, refuse a second submission record
  (`409 already_applied`), copy the resume, set `applied_at` (given date, else the existing one, else now),
  move saved/preparing to applied (a later status is kept), record the status event.
- `applied_at` never changes with status. Edit can correct it but not clear it.
- Duplicates (`POST /api/tracked-jobs/duplicates`, advisory): normalized URL match (host without www,
  no scheme/fragment/tracking parameters, sorted query), then same source + external job ID, then the
  weak company + title match. Two postings on the same ATS with different job IDs are separate roles.
  The web app warns before saving and offers "Save anyway".
- Next action due dates are calendar dates compared with the user's local date in the browser
  (overdue, due today, within 3 days). **No reminders are delivered**: Pypr has no notification
  infrastructure. The partial index on open due dates is ready for a future sender.

## Extraction (`backend/internal/tracker/extract.go`)

`POST /api/job-extractions {url}` fetches the page once and reads, in order:

1. A schema.org `JobPosting` in JSON-LD (object, array or `@graph`): title, company, location,
   remote (`TELECOMMUTE`), employment type, salary, identifier, description (HTML turned into plain text).
2. Otherwise OpenGraph / `<title>` (`partial`: title, site name, summary only).
3. Otherwise `failed` with a reason: `blocked_url`, `requires_auth` (401/403 or a sign-in form),
   `not_found`, `unsupported` (not HTML, or a script-rendered page with nothing in the markup),
   `timeout`, `fetch_failed`.

The ATS and job ID come from the URL alone (`DetectSource`), so even a failed fetch prefills them.
Nothing is guessed; the user reviews every field before saving.

Known gaps: LinkedIn and Indeed block automated reading or need sign-in. Workday pages render with
script, so usually only the URL-derived job ID is found. Greenhouse's newer `job-boards.greenhouse.io`
pages publish only OpenGraph tags (title and location summary). Lever, Ashby and many company career
pages publish JSON-LD. Their public job board APIs could fill the gaps later.

Safety: http(s) only, no credentials in the URL, ports 80/443 only, `localhost`/`.local`/`.internal`
names refused; the dialer refuses any non-public IP (private, loopback, link-local incl. cloud metadata,
CGNAT, NAT64/6to4, reserved) after DNS, so redirects and DNS rebinding are covered; at most 5 redirects,
each re-checked; no proxy; 10 s total timeout, 8 s to first byte; at most 3 MB read; HTML content types
only; 30 extractions per user per hour. Extracted text is plain text and the web app renders it as text.

## API

| Route | |
|---|---|
| `GET /api/tracked-jobs?q=&status=&source=&arrangement=&sort=updated\|created\|applied&limit=&offset=` | `{items, total, next}` (limit ≤ 200) |
| `POST /api/tracked-jobs` | Create (status saved or preparing, optional first `note`) → detail |
| `GET\|PUT\|DELETE /api/tracked-jobs/{id}` | Detail (job, description, history, resumes, notes, interviews) / update / delete |
| `PUT /api/tracked-jobs/{id}/status` | `{status}` |
| `POST /api/tracked-jobs/{id}/apply` | `{appliedAt?, resume: {kind, resumeId?, label?}}` |
| `POST /api/tracked-jobs/{id}/resumes` | Resume record added after applying |
| `GET /api/tracked-jobs/{id}/resumes/{sid}` | One snapshot with its data |
| `PUT /api/tracked-jobs/{id}/next-action` | `{text, due, done}` |
| `POST /api/tracked-jobs/{id}/notes`, `PUT\|DELETE …/notes/{nid}` | Notes |
| `POST /api/tracked-jobs/{id}/interviews`, `PUT\|DELETE …/interviews/{iid}` | Interview rounds |
| `POST /api/tracked-jobs/duplicates` | Likely duplicates for a draft |
| `POST /api/job-extractions` | Read a job page |

Every change replies with the job's full detail. Writes need a verified email (`RequireVerified`).

## Web

`/job-tracker` (board by status or table; search, filters, sort, load more), `/job-tracker/new`
(link → review → duplicate warning → save, or manual entry), `/job-tracker/[id]` (details, edit,
status, apply, resume records with snapshot viewer, next action, interviews, notes, activity). Status
changes use a select (no drag-and-drop library in the stack). Components in `web/components/tracker`,
hooks in `web/lib/api/tracker.ts`, labels and date/time-zone helpers in `web/lib/tracker/meta.ts`.

## Tests

`backend/internal/tracker`: unit tests for URL normalization, source detection, duplicate
classification, JSON-LD and fallback parsing, fetch failures and SSRF blocking; database tests
(`TEST_DATABASE_URL`) for ownership, status history and applied date, snapshot immutability,
duplicates and list filters.
