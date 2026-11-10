-- +goose Up
-- System design (HLD) boards: a canvas of shapes and components, saved per workspace.
create table design_boards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  title text not null check (length(title) between 1 and 120),
  -- Key of the design prompt the board started from (the prompts live in the web app), if any.
  prompt_key text,
  -- {"nodes": [...], "edges": [...], "viewport": {...}, "checklist": {...}}; the API caps it at 1 MB.
  doc jsonb not null default '{"nodes": [], "edges": []}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index design_boards_idx on design_boards (workspace_id, updated_at desc);
alter table design_boards enable row level security;

-- +goose Down
drop table design_boards;
