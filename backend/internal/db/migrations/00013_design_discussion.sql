-- +goose Up
-- The discussion on a system design board: the learner's written explanation, the AI interviewer's evaluation and follow-up chat.
create table design_messages (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references design_boards(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  -- chat: plain message. explanation: the learner's description of the whole design. evaluation: the interviewer's structured review.
  kind text not null check (kind in ('chat', 'explanation', 'evaluation')),
  content text not null check (length(content) <= 12000),
  -- Evaluation only: {summary, scores, covered, gaps, followups}.
  result jsonb,
  created_at timestamptz not null default now()
);
create index design_messages_idx on design_messages (board_id, created_at);
alter table design_messages enable row level security;

-- +goose Down
drop table design_messages;
