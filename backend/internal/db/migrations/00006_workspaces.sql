-- +goose Up
-- A preparation workspace: one career goal and its context. See docs/workspaces.md.
create table workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  target_role text not null,
  seniority text not null default '',
  track text not null default 'ic' check (track in ('ic', 'management', 'both')),
  years_experience smallint check (years_experience between 0 and 60),
  technologies text[] not null default '{}',
  objectives text not null default '',
  job_description text not null default '',
  -- Optional modules the user turned on (validated by the API).
  modules text[] not null default '{}',
  context_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workspaces_user_id_updated_at_idx on workspaces (user_id, updated_at desc);

-- The context as it was before each change, so changes stay auditable.
create table workspace_context_versions (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  version integer not null,
  context jsonb not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, version)
);

-- A resume can serve several workspaces; it is linked, never copied.
create table workspace_resumes (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  resume_id uuid not null references resumes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (workspace_id, resume_id)
);
create index workspace_resumes_resume_id_idx on workspace_resumes (resume_id);

-- What the person knows, shared by all their workspaces. key is a stable slug of the name.
create table user_skills (
  user_id uuid not null references users(id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  name text not null,
  area text not null default '',
  -- Self-reported. Never treated as verified.
  self_level text not null default 'unassessed'
    check (self_level in ('unassessed', 'beginner', 'intermediate', 'advanced', 'ready')),
  -- Shown by assessments or mock interviews (future modules); the API never lets users set it.
  demonstrated_level text
    check (demonstrated_level in ('beginner', 'intermediate', 'advanced', 'ready')),
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- The skills a workspace focuses on, in display order.
create table workspace_skills (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null,
  skill_key text not null,
  position integer not null,
  primary key (workspace_id, skill_key),
  foreign key (user_id, skill_key) references user_skills(user_id, key) on delete cascade
);

-- The workspace's preparation plan. kind = what it is; progress = how it completes.
create table prep_activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  kind text not null
    check (kind in ('concept', 'system_design', 'coding', 'mock_interview', 'behavioral', 'custom')),
  title text not null,
  description text not null default '',
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  progress text not null check (progress in ('check', 'count', 'checklist')),
  -- count: completions needed (e.g. 3 mock interviews).
  target integer check (target between 1 and 100),
  -- checklist: [{"id","text","done"}].
  checklist jsonb not null default '[]',
  skill_key text,
  effort_minutes integer check (effort_minutes between 1 and 10000),
  due_date date,
  criteria text not null default '',
  position integer not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((progress = 'count') = (target is not null))
);
create index prep_activities_workspace_id_position_idx on prep_activities (workspace_id, position);

-- One row per counted completion. A module reports its own session as (source, source_ref);
-- the unique index turns a repeated report into a no-op, so nothing is counted twice.
create table activity_completions (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references prep_activities(id) on delete cascade,
  source text not null default 'manual',
  source_ref text,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index activity_completions_activity_id_idx on activity_completions (activity_id, created_at);
create unique index activity_completions_source_ref_idx
  on activity_completions (activity_id, source, source_ref) where source_ref is not null;

alter table workspaces enable row level security;
alter table workspace_context_versions enable row level security;
alter table workspace_resumes enable row level security;
alter table user_skills enable row level security;
alter table workspace_skills enable row level security;
alter table prep_activities enable row level security;
alter table activity_completions enable row level security;

-- +goose Down
drop table activity_completions;
drop table prep_activities;
drop table workspace_skills;
drop table user_skills;
drop table workspace_resumes;
drop table workspace_context_versions;
drop table workspaces;
