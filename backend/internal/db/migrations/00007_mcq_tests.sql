-- +goose Up
-- Multiple-choice tests. See docs/workspaces.md.
-- Topics are written from internal/mcq/catalog.go at start-up. Questions are added by cmd/kbgen.
create table mcq_topics (
  key text primary key check (key ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  name text not null,
  area text not null,
  description text not null default '',
  tags text[] not null default '{}',
  -- Subtopics the generator walks through so a large bank stays varied.
  outline text[] not null default '{}',
  position integer not null
);

create table mcq_questions (
  id uuid primary key default gen_random_uuid(),
  topic_key text not null references mcq_topics(key) on delete cascade,
  question text not null,
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4),
  answer smallint not null check (answer between 0 and 3),
  explanation text not null,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  subtopic text not null default '',
  -- Normalised question text; the same question is never stored twice for a topic.
  hash text not null,
  created_at timestamptz not null default now(),
  unique (topic_key, hash)
);
create index mcq_questions_topic_key_idx on mcq_questions (topic_key);

create table mcq_tests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  topic_key text not null references mcq_topics(key) on delete cascade,
  question_count integer not null check (question_count between 1 and 200),
  duration_seconds integer not null check (duration_seconds between 60 and 14400),
  started_at timestamptz not null default now(),
  -- The server decides when time is up; the browser only shows the countdown.
  deadline timestamptz not null,
  submitted_at timestamptz,
  score integer,
  -- Set when the test tab is closed; a reload clears it, otherwise the test is submitted after a short grace.
  left_at timestamptz
);
create index mcq_tests_workspace_idx on mcq_tests (workspace_id, started_at desc);

create table mcq_test_questions (
  test_id uuid not null references mcq_tests(id) on delete cascade,
  position integer not null,
  question_id uuid not null references mcq_questions(id) on delete cascade,
  selected smallint check (selected between 0 and 3),
  marked boolean not null default false,
  primary key (test_id, position)
);
create index mcq_test_questions_question_idx on mcq_test_questions (question_id);

-- Questions about one answered question, asked after the test. Kept so the tutor sees the whole conversation.
create table mcq_chat_messages (
  id bigint generated always as identity primary key,
  test_id uuid not null,
  position integer not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now(),
  foreign key (test_id, position) references mcq_test_questions(test_id, position) on delete cascade
);
create index mcq_chat_messages_idx on mcq_chat_messages (test_id, position, id);

alter table mcq_topics enable row level security;
alter table mcq_questions enable row level security;
alter table mcq_tests enable row level security;
alter table mcq_test_questions enable row level security;
alter table mcq_chat_messages enable row level security;

-- +goose Down
drop table mcq_chat_messages;
drop table mcq_test_questions;
drop table mcq_tests;
drop table mcq_questions;
drop table mcq_topics;
