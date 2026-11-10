-- +goose Up
-- The server-side runner is our own Docker runner now, not Judge0: rename the value.
alter table code_problems drop constraint code_problems_runner_check;
update code_problems set runner = 'server' where runner = 'judge0';
alter table code_problems add constraint code_problems_runner_check check (runner in ('browser', 'server'));

-- +goose Down
alter table code_problems drop constraint code_problems_runner_check;
update code_problems set runner = 'judge0' where runner = 'server';
alter table code_problems add constraint code_problems_runner_check check (runner in ('browser', 'judge0'));
