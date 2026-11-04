-- +goose Up
create table users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sessions (
  token_hash bytea primary key,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index sessions_user_id_idx on sessions (user_id);

create table password_resets (
  token_hash bytea primary key,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index password_resets_user_id_idx on password_resets (user_id);

-- Defense in depth: no policies, so only the owning role (the API) can read these.
alter table users enable row level security;
alter table sessions enable row level security;
alter table password_resets enable row level security;

-- +goose Down
drop table password_resets;
drop table sessions;
drop table users;
