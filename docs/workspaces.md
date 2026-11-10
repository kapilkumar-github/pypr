# Preparation workspaces

A workspace is one career goal ("Lead Backend Engineer — Go / Node.js"). The user owns its plan:
AI and rules only suggest activities, the user reviews them, and the user can always write a
plan such as "Learn 5 concepts, complete 3 mock interviews" by hand.

## 1. What existed before (repository analysis)

| Area | State |
|---|---|
| Backend | Go `net/http` mux, pgx raw SQL, goose migrations in schema `app`, one `Handler` per package with `Register(mux, middleware…)` |
| Auth | DB sessions (`pypr_session` cookie). `RequireUser` for reads, `RequireVerified` for writes. Every query is scoped by `user_id`; foreign or malformed IDs return 404 |
| Errors | `{"error":{code,message,fields}}`; hand-written `validate() map[string]string` → 422 `validation_failed` |
| AI | Ports (`jobmatch.Analyzer`, `resumeparse.Parser`) over `openrouter.Client.ChatJSON`, `Fake` for tests, `AI_PROVIDER=none` disables. Slow calls run as in-memory polled jobs (`internal/jobs`) |
| Resumes | `resumes.data` jsonb, opaque to the API; shape owned by `web/lib/resume/types.ts`. Skills are comma-separated strings per category; years come from dated experience (`experienceYears`) |
| Web | Next 16 App Router, TanStack Query hooks in `lib/api/*`, shadcn primitives, `components/common/*`, sidebar `nav` in `components/app/app-sidebar.tsx` |
| Job match | Exists (`/job-match`): rule-based posting reader in the browser plus optional AI analysis |
| Job tracker, interview prep, mock interviews | **Not built.** Listed in the sidebar as "Soon" only. No tables, routes or components |

## 2. Design

### Context levels

- **Global user context** is derived, not copied: resumes stay in `resumes.data`; the create form
  reads structured fields from the chosen resume in the browser (no AI). Knowledge levels live in
  `user_skills`, one row per person and skill, shared by every workspace.
- **Workspace context** is the `workspaces` row (target role, seniority, track, years, technologies,
  objectives, job description, enabled modules) plus its resumes (`workspace_resumes`) and focus
  skills (`workspace_skills`). `GET /api/workspaces/{id}` returns it, and Go code reads it with
  `workspace.Load`. Each context change bumps `context_version` and stores the previous context in
  `workspace_context_versions`.
- **Module context** belongs to the module that needs it (a future `mock_interview_sessions` table
  would hold interview type, difficulty and history) and references the workspace by ID. It reads the
  shared part through `workspace.Load`. Nothing copies the workspace into module tables.

### Schema (`backend/internal/db/migrations/00006_workspaces.sql`)

```
workspaces(id, user_id → users, name, target_role, seniority, track ic|management|both,
           years_experience?, technologies text[], objectives, job_description, modules text[],
           context_version, created_at, updated_at)
workspace_context_versions(workspace_id, version, context jsonb, created_at)   -- audit trail
workspace_resumes(workspace_id, resume_id → resumes)                          -- many-to-many
user_skills(user_id, key, name, area, self_level, demonstrated_level?, updated_at)
workspace_skills(workspace_id, user_id, skill_key → user_skills, position)
prep_activities(id, workspace_id, kind, title, description, priority, status, progress
                check|count|checklist, target?, checklist jsonb, skill_key?, effort_minutes?,
                due_date?, criteria, position, completed_at?, created_at, updated_at)
activity_completions(id, activity_id, source, source_ref?, note, created_at)
                unique (activity_id, source, source_ref) where source_ref is not null
```

Decisions:

- **One plan per workspace.** Activities hang directly off the workspace. A separate `plans` table
  would only matter for several plans per workspace, which nobody has asked for.
- **Modules are a text array** validated against a fixed list in Go (`system_design`, `coding`,
  `mock_interviews`, `behavioral`, `leadership`). Plan, knowledge and progress are always on. None of
  the optional modules is built yet: the UI marks them "Planned", and enabling one only shapes the
  suggestions. A new module adds a key, not a table change.
- **Skill keys are stable slugs** made from the name (`"Database sharding"` → `database-sharding`).
  The same skill in two workspaces is the same row, so a level set once shows everywhere. Which
  skills matter stays per workspace (`workspace_skills`).
- **Self-assessment and evidence are separate columns.** `self_level` is set by the user;
  `demonstrated_level` is never writable through the API and is reserved for future assessments and
  mock interviews. Levels: `unassessed`, `beginner`, `intermediate`, `advanced`, `ready`.

### Activity and progress model

`kind` says what the activity is (concept, system design, coding, mock interview, behavioral,
custom); `progress` says how it completes. They are independent, so no concept is hard-coded.

| `progress` | Completes when | Status rule |
|---|---|---|
| `check` | The user marks it done ("I understand sharding") | Set by the user: `todo`, `in_progress`, `done` |
| `count` | `completions ≥ target` (0/3 → 3/3) | Derived from completions |
| `checklist` | Every item is ticked | Derived from items |

Count progress is a row per completion in `activity_completions`. Manual entries have
`source = manual`. A future module records its session with its own `source` and `source_ref`
(`mock_interview`, session ID) through `workspace.RecordCompletion`; the unique index makes a
repeated report a no-op, so nothing is counted twice. Users can only undo manual completions.

The dashboard figure is labelled **plan completion** (done activities ÷ all activities). It is
not a readiness score.

### API (all under `/api`, JSON, reads `RequireUser`, writes `RequireVerified`)

| Method & path | Does |
|---|---|
| `GET /workspaces` | List with activity counts |
| `POST /workspaces` | Create (context, `resumeIds`, `skills`) |
| `GET /workspaces/{id}` | Full context: resumes, skills with levels |
| `PUT /workspaces/{id}` | Replace context; snapshots the previous one when it changed |
| `DELETE /workspaces/{id}` | Delete workspace and its plan (resumes untouched) |
| `GET /workspaces/{id}/activities` | Plan in order |
| `POST /workspaces/{id}/activities` | Add 1–50 activities (manual or accepted suggestions) |
| `PUT /workspaces/{id}/activities/{aid}` | Edit |
| `DELETE /workspaces/{id}/activities/{aid}` | Remove |
| `PUT /workspaces/{id}/activities/order` | Reorder (`ids` must be exactly the plan) |
| `POST /workspaces/{id}/activities/{aid}/completions` | Record one manual completion |
| `DELETE /workspaces/{id}/activities/{aid}/completions/{cid}` | Undo a manual completion |
| `GET /workspaces/{id}/suggestions` | Rule-based suggestions (no AI) |
| `POST /workspaces/{id}/plan-suggestions` + `GET …/plan-suggestions/{job}` | AI suggestions as a polled job |
| `PUT /skills/{key}` | Set own `selfLevel` |

Suggestions are never saved by the server; the user picks which ones to add.

### AI

`workspace.Planner` port (`openrouter` adapter, `Fake`), same pattern as `jobmatch.Analyzer`. The
model returns JSON. Every item goes through the same validation as user input; invalid items are
dropped. With `AI_PROVIDER=none` the button is hidden and the rule-based suggestions still work.
Progress, status and resume prefill never call AI.

### Web routes and UI

| Route | Screen |
|---|---|
| `/workspaces` | List (collection-page pattern) + create card |
| `/workspaces/new?resume=<id>` | Create form; prefilled from the resume; `?from=job-match` prefills the posting |
| `/workspaces/[id]` | Dashboard: overview, continue preparing, plan summary, modules, knowledge, attention |
| `/workspaces/[id]/plan` | Full plan editor |
| `/workspaces/[id]/knowledge` | Self-assessment of focus skills |
| `/workspaces/[id]/tests`, `/tests/[testId]` | Multiple-choice tests: Selected / All / Results, taking and reviewing a test |
| `/workspaces/[id]/settings` | Edit context, delete |

A shared layout under `[id]` shows the active workspace name, a switcher and the section tabs.
Sidebar: Workspaces, Resumes, Job match, Mock interview (Soon), Job tracker (Soon). Resume cards
get **Prepare for a role**; Job match gets **Prepare for this job**.

Resume prefill (browser, deterministic): years from `experienceYears`, skills from the skill
categories, current role from the latest experience. The target role starts empty with the current
role offered as a one-click suggestion, and nothing is created until the user submits.

## 3. Implementation order

1. Migration 00006 (tables, indexes, RLS).
2. `internal/workspace`: model + validation + status rules (unit tests).
3. Workspace CRUD handlers, resume links, skills, context history.
4. Activities: CRUD, order, completions (integration test against Postgres when `TEST_DATABASE_URL` is set).
5. Rule-based suggestions, then the AI planner port (unit tests with `Fake`).
6. Web: API hooks, list, create form with resume prefill, `[id]` layout + dashboard.
7. Plan editor (add/edit/reorder/progress), suggestions review, knowledge view, settings.
8. Entry points: sidebar, resume card action, job match action, `proxy.ts` matcher.

## 4. Multiple-choice tests

A global bank of multiple-choice questions per topic (up to about 1,000 each). A workspace has a **Tests** tab:
**Selected** (topics matching the role), **All** (every topic) and **Results**.

- **Schema** (`00007_mcq_tests.sql`): `mcq_topics` (catalog, with an AI-written `outline` of subtopics),
  `mcq_questions` (4 options, `answer` index, explanation, difficulty, `hash` unique per topic),
  `mcq_tests` (per workspace, with a server-side `deadline`) and `mcq_test_questions` (the questions of a test
  with the saved selection).
- **Catalog** is code (`internal/mcq/catalog.go`, one line per topic with tags) synced at start. Selected
  topics are matched by tags against the workspace's role, seniority, technologies and skills
  (`internal/mcq/select.go`); with no match, DSA and System design.
- **Questions** are added with the CLI, not at request time:
  `go run ./cmd/kbgen --topic nodejs --count 1000` (`--topic all`, `--list`). It reads `DATABASE_URL` and the AI
  settings, so run it against prod's `DATABASE_URL` to fill prod. It plans subtopics once, then generates in
  batches (subtopic by difficulty), shuffles the options in code so the correct position is random, rejects
  "all of the above" style options, skips duplicates, and can be stopped and re-run.
- **Taking a test**: `POST /api/workspaces/{id}/mcq/tests {topic, questions, durationMinutes}` (5-200 questions,
  5-180 minutes, defaults 50 and 30 in the UI). Questions the person has not seen come first, then the ones seen
  longest ago. Answers are saved on every click (`PUT .../answers`), so a refresh resumes. Correct answers and
  explanations leave the server only after the test is finished. The server enforces the deadline: late saves get
  409 and an expired test is scored with what was saved.
- **Workspace creation** needs only a name and a resume (existing or uploaded). Role, seniority, years and
  skills are read from the resume in the browser (`contextFromResume`, `seniorityFor`); the API requires at least
  one `resumeIds` on create. Everything can be edited in Settings.

## 5. Coding playground

Route `/code/{workspace}/{problem}`: statement on the left, editor top right, tests / console / preview bottom right.
Problems live in `code_problems` (migrations 00008-00010) and are made by `cmd/codegen`, never by learners.

| Runner | Languages | Problem shape | Where code runs |
|---|---|---|---|
| `browser` | JavaScript, HTML + CSS | functions + tests (HTML: DOM and computed styles) | sandboxed iframe (`allow-scripts`, no `allow-same-origin`) + Web Worker, killed after 5 s |
| `server` harness | Node.js, TypeScript | machine coding: the learner writes classes/functions, server-side tests call them | our Docker runner |
| `server` stdio | JavaScript, TypeScript | DSA: read stdin, print stdout | our Docker runner |

- **Own runner** (`internal/runner`, `CODE_RUNNER=docker`): one warm container `pypr-runner` (`node:22-alpine`, no network,
  read-only root, 64 MB tmpfs, 768 MB / 2 CPUs / 256 pids, all capabilities dropped for learners). Each run is a
  `docker exec` (about 100-300 ms; creating a container per run cost 5-10 s on the dev host) in one of 4 slots, each
  a distinct unprivileged uid with private files (umask 077). The source goes in an environment variable that is
  unset before the program starts. `timeout -s KILL 4` limits time; afterwards the slot's processes and files are removed.
  TypeScript runs with Node's `--experimental-strip-types`: types are erased, **not checked**, so no enums, namespaces or
  parameter properties. Python, Java, Go and C++ are not supported (Judge0 was tried and dropped; see D19).
- **Server side** (`codeprob/judge.go`): `POST .../code/problems/{pid}/judge {language, source, submit}`.
  Run checks the visible tests, Submit checks all and stores the attempt with a score computed on the server.
  Hidden inputs and all harness test code stay on the server; only a count of hidden tests is sent.
  Limits: 60 runs per user per 10 minutes, 4 batches at once, 64 KB of source.
- **Harness**: the learner's file plus the tests are one program; tests run as async functions in the file's scope
  and print one JSON line behind a random marker. A determined learner can read the file and forge that line, and
  learners share one container kernel, so scores are practice feedback, not an assessment.
- **Browser results are self-reported** (`POST .../attempts`, refused for server problems).
- **Docker socket**: the API must reach the Docker socket to run this, which is root-equivalent on the host. Dev only for
  now. The prod API container (`deploy/homeserver`) has no socket and `cap_drop: ALL`; prod keeps `CODE_RUNNER=none`
  (server problems answer 503 "code runner is offline") until a safer way is chosen (rootless Docker on a separate
  user, or a small runner service).
- **Generating problems**: `go run ./cmd/codegen --topic node-js|typescript|data-structures-and-algorithms|javascript|html-and-css --count N`.
  Browser kinds are checked in headless Chrome through the web app's `/code-verify` page (starter fails, solution
  passes twice). Server harness kinds are checked on the runner the same way. DSA: the AI writes a JavaScript reference
  solution and test inputs; expected outputs come from running that solution (twice, identical), and the outputs the
  statement shows must match. Needs `CODE_RUNNER=docker`, `AI_PROVIDER=openrouter`, and for browser kinds Chrome
  (`CHROME_PATH`, `CHROME_NO_SANDBOX=true` where Chrome's sandbox is unavailable) and the web app at `APP_URL`.

## 6. Machine coding (`backend/internal/machine`, migration `00011`)

A module of its own, apart from the topic drawers, DSA and system design. A **problem** has a statement, a checklist of
requirements, evaluation criteria (what an interviewer scores), optional follow-ups, starter code and 2–3 **stages**.
Each stage adds requirements to the same file ("now make it work across several servers") and has visible and hidden
tests, hints and a reference solution as of that stage. Categories: utility, backend component, application (30 problems,
`internal/machine/seeds.go`).

- **Cumulative judging.** Judging stage k runs the tests of stages 1..k against the learner's file, through
  `codeprob.Judge` on the code runner, so stage 2 cannot break stage 1. A stage is cleared only by a **Submit** that passes
  every test; Run shows the visible tests only. Hidden tests are shown as "Hidden test N" with a verdict and nothing else.
  Stage k+1 stays locked (title only) until stage k is cleared.
- **Sessions** (`mc_sessions`) carry the mode, so the API enforces it: *Practice* is untimed, has hints per stage, and a
  stage's solution unlocks after you submit that stage. *Interview* has a server clock (`ends_at`, 15–180 min), no hints,
  the solution and the review open only when it is over (time up, "End", or the last stage cleared), and follow-ups
  appear at the end. *Review* needs an earlier attempt; it shows every stage and the reference solutions, and
  `POST …/review` has an AI interviewer score the latest submitted code on the problem's criteria (1–5 each) with a
  summary and concrete improvements (`mc_reviews`; 10 per hour per user). Attempts are stored with server-computed scores.
- **FakeRedis.** The runner has no network, so problems about Redis (rate limiter across instances, distributed lock) get
  a read-only prelude, `internal/machine/fakeredis.js`: an in-memory client with the common commands, `eval`/`multi` for
  atomic steps, and failure injection (`fail()`, `delay(ms)`, `recover()`). It is prepended to the learner's code on the
  runner and shown as a read-only tab in the editor. Tests build their own `new FakeRedis({ now })`.
- **Deterministic time.** Problems inject a clock (`now`) and timers/sleep so tests never wait on real time.
- **Generation.** `go run ./cmd/mcgen [--only slug]` drafts each seed with the AI, then **verifies by running**: the
  starter must fail the stage 1 tests without crashing; every stage's solution must pass its tests twice; and the previous
  stage's solution must fail the new stage's tests (each stage adds something). A rejected draft goes back to the model with
  the reason (up to `--repairs` times). Needs `CODE_RUNNER=docker` and `AI_PROVIDER=openrouter`.
- Routes: `/workspaces/{id}/machine-coding` (list, mode picker) and full screen `/machine/{workspace}/{session}`.
  API under `/api/workspaces/{id}/machine/`: `problems`, `problems/{pid}/sessions`, `sessions/{sid}` (+ `judge`, `finish`,
  `hints`, `solution`, `review`). Like the other server-run problems it is dev-only until the runner is deployed
  (`CODE_RUNNER=none` answers 503 "code runner is offline").

## 7. System design canvas (`backend/internal/design`, migration `00012`)

Boards of shapes and system components, saved per workspace (`design_boards`; the document is JSON, at most 1 MB, up to
50 boards per workspace). The web app uses React Flow (`@xyflow/react`).

- **Palette.** Shapes: rectangle, rounded box, ellipse, decision diamond, cylinder, cloud, hexagon, note, group box.
  Components: web client, mobile app, DNS, CDN, load balancer, API gateway, reverse proxy, firewall, server, service,
  worker, scheduler, auth service, rate limiter, third-party API, SQL and NoSQL databases, cache, object storage, search
  index, message queue, event stream, pub/sub topic, monitoring, logging. Click or drag to add; every item can change shape
  and colour, so a component can be any shape.
- **Editing.** Drag the dots on an item to draw arrows (label, line style, arrowheads, dashed or animated, colour); double-click
  to type; resize; multi-select; copy, paste, duplicate; undo/redo (100 steps); snap to grid; minimap; export PNG or JSON,
  import JSON. Autosave 1.5 s after the last change (last write wins).
- **Requirements** (`web/components/design/prompts.ts`, static): 12 classic questions. The **Requirement** tab shows the
  summary, the functional requirements and a checklist whose ticks are stored in the board. The non-functional
  requirements and the scale numbers are *not* shown: the learner writes them. The expected ones stay in `prompts.ts` as a
  hidden reference sent to the interviewer.
- **Floating notes** (`notes.tsx`, saved in `doc.notes`, at most 30): draggable, resizable cards over the canvas that
  minimize to chips at the bottom left. Every board starts with *Non-functional requirements* and *Back-of-envelope
  estimation*; the Notes menu in the toolbar restores them or adds blank notes. Not part of undo (the textarea has its own).
- **Evaluate** (toolbar, `internal/design/evaluate.go`, migration `00013`): saves the board, then the AI interviewer reads
  the *saved* board as text (components, connections, notes), the question and an optional written description of the
  whole design. It returns a score (1–5) for seven fixed areas (requirements coverage, estimation, architecture, data,
  scalability, reliability, trade-offs), what is covered, the gaps, and 2–4 follow-up questions. It checks the learner's
  estimates for sense and consistency with the diagram, and the description against the diagram.
  `POST …/boards/{bid}/evaluate` (10 per hour per user).
- **Discussion** tab: the thread (`design_messages`, kept with the board) of description, evaluations and chat.
  `POST …/{bid}/chat` (60 per hour) answers the learner's replies to the follow-ups and asks the next one; messages
  off the design and its question are refused with 422 `off_topic` and not stored. `GET …/{bid}/messages` lists the thread.
  Both need AI (`AI_PROVIDER=openrouter`); without it they answer 503 `ai_unavailable`. Next's rewrite proxy waits up to
  120 s (`experimental.proxyTimeout`) because an evaluation can take 20–60 s.
- Routes: `/workspaces/{id}/design` (boards and prompts), full screen `/design/{workspace}/{board}`. API:
  `/api/workspaces/{id}/design/boards[/{bid}]`. Works in prod: it needs no code runner.

## Acceptance scenarios

| Scenario | Covered by |
|---|---|
| A resume → workspace | Resume card "Prepare for a role" → prefilled form → dashboard |
| B custom plan | Plan editor: concepts (`check`) + "Complete 3 mock interviews" (`count`, manual completions) |
| C multiple workspaces | Each workspace has its own activities; the switcher moves between them |
| D shared resume | `workspace_resumes` links; no resume copy |
| E future module | `RecordCompletion(source, ref)` with dedupe; `demonstrated_level` reserved |
| F global features | Resumes and Job match unchanged and outside `/workspaces` |
