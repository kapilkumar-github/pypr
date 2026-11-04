-- +goose Up
create table resume_versions (
  id uuid primary key default gen_random_uuid(),
  resume_id uuid not null references resumes(id) on delete cascade,
  -- null for automatic snapshots taken at the start of an editing session
  label text,
  title text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index resume_versions_resume_id_created_at_idx on resume_versions (resume_id, created_at desc);
alter table resume_versions enable row level security;

alter table resumes
  add column public boolean not null default false,
  add column slug text unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$'),
  add column hide_contact boolean not null default false,
  add column allow_download boolean not null default true,
  add column indexable boolean not null default false,
  add column views integer not null default 0,
  add column downloads integer not null default 0;

-- +goose Down
alter table resumes
  drop column public,
  drop column slug,
  drop column hide_contact,
  drop column allow_download,
  drop column indexable,
  drop column views,
  drop column downloads;
drop table resume_versions;
