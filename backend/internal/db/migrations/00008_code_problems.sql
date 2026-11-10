-- +goose Up
-- Coding problems for the practice playground. Added by cmd/codegen after the problem was run and checked.
create table code_problems (
  id uuid primary key default gen_random_uuid(),
  topic_key text not null references mcq_topics(key) on delete cascade,
  kind text not null check (kind in ('machine_coding', 'dsa')),
  language text not null check (language in ('javascript', 'typescript', 'nodejs', 'html')),
  title text not null,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  statement text not null,
  -- File name to content, for example {"index.js": "..."} or {"index.html": "", "style.css": "", "script.js": ""}.
  starter jsonb not null,
  -- [{"name": "...", "code": "...", "hidden": false}]; the code is the body of an async function.
  tests jsonb not null,
  -- Reference solution, same shape as starter. Sent to a learner only after an attempt.
  solution jsonb not null,
  hint text not null default '',
  hash text not null,
  created_at timestamptz not null default now(),
  unique (topic_key, kind, hash)
);
create index code_problems_topic_idx on code_problems (topic_key, kind);

create table code_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  problem_id uuid not null references code_problems(id) on delete cascade,
  files jsonb not null,
  passed integer not null check (passed >= 0),
  total integer not null check (total > 0),
  created_at timestamptz not null default now(),
  check (passed <= total)
);
create index code_attempts_idx on code_attempts (workspace_id, problem_id, created_at desc);

alter table code_problems enable row level security;
alter table code_attempts enable row level security;

-- +goose Down
drop table code_attempts;
drop table code_problems;
