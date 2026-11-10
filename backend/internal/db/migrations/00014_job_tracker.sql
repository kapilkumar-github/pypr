-- +goose Up
-- Job tracker: jobs a user saved or applied to. See docs/job-tracker.md.
create table tracked_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  company text not null,
  title text not null,
  location text not null default '',
  work_arrangement text not null default 'unknown'
    check (work_arrangement in ('remote', 'hybrid', 'onsite', 'unknown')),
  employment_type text not null default '',
  discovery_url text not null default '',
  application_url text not null default '',
  portal_url text not null default '',
  application_ref text not null default '',
  -- ATS or site the job came from (validated by the API); '' when unknown.
  source text not null default '',
  external_id text not null default '',
  -- Kept locally so it survives the listing being taken down. Plain text.
  description text not null default '',
  salary_min numeric(12, 2) check (salary_min >= 0),
  salary_max numeric(12, 2) check (salary_max >= 0),
  salary_currency text not null default '' check (salary_currency ~ '^([A-Z]{3})?$'),
  salary_period text not null default '' check (salary_period in ('', 'year', 'month', 'week', 'day', 'hour')),
  status text not null default 'saved'
    check (status in ('saved', 'preparing', 'applied', 'interviewing', 'offer', 'accepted', 'rejected', 'withdrawn', 'closed')),
  -- Set when the user first confirms applying; corrected by hand, never cleared by status changes.
  applied_at timestamptz,
  -- The resume being prepared for this job. Submitted versions are copied into job_resume_snapshots.
  resume_id uuid references resumes(id) on delete set null,
  next_action text not null default '',
  next_action_due date,
  next_action_done_at timestamptz,
  -- Duplicate detection keys, computed by the API: normalized URLs and company|title.
  url_keys text[] not null default '{}',
  match_key text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (salary_min is null or salary_max is null or salary_min <= salary_max)
);
create index tracked_jobs_user_id_updated_at_idx on tracked_jobs (user_id, updated_at desc);
create index tracked_jobs_user_id_status_idx on tracked_jobs (user_id, status);
create index tracked_jobs_url_keys_idx on tracked_jobs using gin (url_keys);
create index tracked_jobs_external_idx on tracked_jobs (user_id, source, external_id) where external_id <> '';
create index tracked_jobs_match_key_idx on tracked_jobs (user_id, match_key);
-- Open next actions by due date, for due indicators now and reminders later.
create index tracked_jobs_next_action_due_idx on tracked_jobs (user_id, next_action_due)
  where next_action_due is not null and next_action_done_at is null;

-- Every status change. from_status is null for the first row (job created).
create table job_status_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references tracked_jobs(id) on delete cascade,
  from_status text,
  to_status text not null,
  created_at timestamptz not null default now()
);
create index job_status_events_job_id_idx on job_status_events (job_id, created_at);

-- Resume records for an application. at_submission marks the one recorded when the user confirmed
-- applying; rows added later say so. kind 'pypr' copies the resume (title + data incl. template and
-- design settings), so later edits or deleting the resume don't change it.
create table job_resume_snapshots (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references tracked_jobs(id) on delete cascade,
  kind text not null check (kind in ('pypr', 'external', 'none')),
  at_submission boolean not null,
  resume_id uuid references resumes(id) on delete set null,
  title text not null default '',
  data jsonb,
  -- For external resumes: the user's label, e.g. a file name.
  label text not null default '',
  created_at timestamptz not null default now(),
  check ((kind = 'pypr') = (data is not null))
);
create index job_resume_snapshots_job_id_idx on job_resume_snapshots (job_id, created_at);
create unique index job_resume_snapshots_submission_idx on job_resume_snapshots (job_id) where at_submission;

-- Snapshots are immutable: only the resume link may change (set null when the resume is deleted).
-- +goose StatementBegin
create function job_resume_snapshots_immutable() returns trigger language plpgsql as $$
begin
  if new.kind is distinct from old.kind or new.at_submission is distinct from old.at_submission
     or new.title is distinct from old.title or new.data is distinct from old.data
     or new.label is distinct from old.label or new.job_id is distinct from old.job_id
     or new.created_at is distinct from old.created_at
     or (new.resume_id is not null and new.resume_id is distinct from old.resume_id) then
    raise exception 'resume snapshots are immutable';
  end if;
  return new;
end $$;
-- +goose StatementEnd
create trigger job_resume_snapshots_immutable before update on job_resume_snapshots
  for each row execute function job_resume_snapshots_immutable();

create table job_notes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references tracked_jobs(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index job_notes_job_id_idx on job_notes (job_id, created_at);

-- One row per interview round; statuses stay coarse.
create table job_interviews (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references tracked_jobs(id) on delete cascade,
  round text not null,
  scheduled_at timestamptz,
  -- IANA zone the interview was scheduled in (e.g. Europe/Berlin).
  timezone text not null default '',
  meeting_url text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index job_interviews_job_id_idx on job_interviews (job_id, scheduled_at);

alter table tracked_jobs enable row level security;
alter table job_status_events enable row level security;
alter table job_resume_snapshots enable row level security;
alter table job_notes enable row level security;
alter table job_interviews enable row level security;

-- +goose Down
drop table job_interviews;
drop table job_notes;
drop table job_resume_snapshots;
drop function job_resume_snapshots_immutable();
drop table job_status_events;
drop table tracked_jobs;
