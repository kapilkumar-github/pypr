-- +goose Up
-- Browser extension: sessions it holds, one-time authorization codes, and an idempotency key for saved jobs.
-- See docs/extension.md.
alter table sessions add column kind text not null default 'web' check (kind in ('web', 'extension'));

create table extension_codes (
  code_hash bytea primary key,
  user_id uuid not null references users(id) on delete cascade,
  -- PKCE: base64url(sha256(verifier)) the extension committed to.
  challenge text not null,
  redirect_uri text not null,
  expires_at timestamptz not null,
  used_at timestamptz
);
create index extension_codes_expires_idx on extension_codes (expires_at);
alter table extension_codes enable row level security;

-- A retried or double-clicked save sends the same key and gets the job it already created.
alter table tracked_jobs add column client_key text not null default '';
create unique index tracked_jobs_client_key_idx on tracked_jobs (user_id, client_key) where client_key <> '';

-- +goose Down
drop index tracked_jobs_client_key_idx;
alter table tracked_jobs drop column client_key;
drop table extension_codes;
alter table sessions drop column kind;
