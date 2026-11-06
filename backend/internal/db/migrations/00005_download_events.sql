-- +goose Up
-- One row per server-side PDF download, so downloads can be charted over time.
create table download_events (
  id bigint generated always as identity primary key,
  resume_id uuid references resumes(id) on delete set null,
  kind text not null,
  created_at timestamptz not null default now()
);
create index download_events_created_at_idx on download_events (created_at);
alter table download_events enable row level security;

-- +goose Down
drop table download_events;
