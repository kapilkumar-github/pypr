-- +goose Up
-- Machine coding: multi-stage problems (each stage adds requirements) and the sessions learners spend on them.
-- Problems are written by cmd/mcgen after every stage was run against its reference solution.
create table mc_problems (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  category text not null check (category in ('utility', 'backend', 'app')),
  language text not null default 'nodejs' check (language in ('nodejs')),
  title text not null,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  summary text not null,
  statement text not null,
  -- ["Requirement", ...] for the whole problem, shown as a checklist.
  requirements jsonb not null default '[]',
  -- [{"name": "Concurrency", "description": "..."}]: what the Review mode scores.
  evaluation jsonb not null default '[]',
  -- Optional senior follow-ups, plain strings.
  followups jsonb not null default '[]',
  -- {"index.js": "..."}
  starter jsonb not null,
  -- Read-only support code placed before the learner's code (for example an in-memory Redis).
  prelude text not null default '',
  -- [{"n": 1, "title": "...", "requirements": "...", "hints": ["..."], "tests": [{"name": "...", "code": "...", "hidden": false}]}]
  stages jsonb not null,
  -- {"1": "source", "2": "source"}: cumulative reference solutions, one per stage.
  solutions jsonb not null,
  duration_minutes integer not null default 60 check (duration_minutes between 15 and 180),
  hash text not null,
  created_at timestamptz not null default now()
);
create index mc_problems_category_idx on mc_problems (category, created_at);

create table mc_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  problem_id uuid not null references mc_problems(id) on delete cascade,
  mode text not null check (mode in ('practice', 'interview', 'review')),
  started_at timestamptz not null default now(),
  -- Interview mode only.
  ends_at timestamptz,
  -- The highest stage whose tests (and every earlier stage's) all passed on a submit.
  stage_reached integer not null default 0,
  finished_at timestamptz
);
create index mc_sessions_idx on mc_sessions (workspace_id, problem_id, started_at desc);

create table mc_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references mc_sessions(id) on delete cascade,
  stage integer not null check (stage >= 1),
  source text not null,
  passed integer not null check (passed >= 0),
  total integer not null check (total > 0),
  created_at timestamptz not null default now(),
  check (passed <= total)
);
create index mc_attempts_idx on mc_attempts (session_id, created_at desc);

create table mc_reviews (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references mc_sessions(id) on delete cascade,
  attempt_id uuid references mc_attempts(id) on delete set null,
  -- {"scores": [{"criterion": "...", "score": 1-5, "comment": "..."}], "summary": "...", "improvements": ["..."]}
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index mc_reviews_idx on mc_reviews (session_id, created_at desc);

alter table mc_problems enable row level security;
alter table mc_sessions enable row level security;
alter table mc_attempts enable row level security;
alter table mc_reviews enable row level security;

-- +goose Down
drop table mc_reviews;
drop table mc_attempts;
drop table mc_sessions;
drop table mc_problems;
