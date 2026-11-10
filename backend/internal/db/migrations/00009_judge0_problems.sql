-- +goose Up
-- Problems that run on Judge0 (server side) instead of in the learner's browser.
--   runner 'browser': tests are [{name, code, hidden}] and run in the browser sandbox (JavaScript, HTML + CSS).
--   runner 'judge0', language 'nodejs' or 'typescript': a harness problem. tests are [{name, code, hidden}] run on the server.
--   runner 'judge0', language 'stdio': read stdin, print stdout. tests are [{name, input, expected, hidden}];
--     the learner picks the language, the solution is a Python reference program.
alter table code_problems add column runner text not null default 'browser' check (runner in ('browser', 'judge0'));
alter table code_problems drop constraint code_problems_language_check;
alter table code_problems add constraint code_problems_language_check check (language in ('javascript', 'typescript', 'nodejs', 'html', 'stdio'));
alter table code_attempts add column language text;

-- Node.js and TypeScript problems made for the browser shims are replaced by Judge0 ones.
delete from code_problems where language in ('nodejs', 'typescript');
-- DSA problems made for the browser (JavaScript) are replaced by stdin/stdout ones.
delete from code_problems where kind = 'dsa';

-- +goose Down
alter table code_attempts drop column language;
alter table code_problems drop constraint code_problems_language_check;
alter table code_problems add constraint code_problems_language_check check (language in ('javascript', 'typescript', 'nodejs', 'html'));
alter table code_problems drop column runner;
