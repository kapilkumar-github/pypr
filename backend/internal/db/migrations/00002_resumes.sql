-- +goose Up
create table resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index resumes_user_id_updated_at_idx on resumes (user_id, updated_at desc);

alter table resumes enable row level security;

-- +goose Down
drop table resumes;
