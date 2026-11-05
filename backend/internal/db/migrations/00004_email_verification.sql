-- +goose Up
-- Existing users start unverified and are asked to verify on their next visit.
alter table users add column email_verified_at timestamptz;

create table email_verifications (
  token_hash bytea primary key,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index email_verifications_user_id_idx on email_verifications (user_id, created_at desc);
alter table email_verifications enable row level security;

-- +goose Down
drop table email_verifications;
alter table users drop column email_verified_at;
