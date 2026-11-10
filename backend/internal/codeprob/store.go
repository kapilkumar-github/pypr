// Package codeprob holds coding problems (machine coding and DSA) for the browser playground and the attempts made on them.
package codeprob

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"pypr/backend/internal/workspace"
)

type DB = workspace.DB

const (
	KindMachine = "machine_coding"
	KindDSA     = "dsa"

	RunnerBrowser = "browser"
	RunnerServer  = "server"
	// LangStdio marks a problem that reads stdin and prints stdout, in any language the runner offers.
	LangStdio = "stdio"

	maxFilesBytes = 100 * 1024
)

var errNoAttempt = errors.New("no attempt yet")

func isNotFound(err error) bool {
	var pgErr *pgconn.PgError
	return errors.Is(err, pgx.ErrNoRows) || (errors.As(err, &pgErr) && pgErr.Code == "22P02")
}

func ownsWorkspace(ctx context.Context, db DB, userID, id string) error {
	var x int
	return db.QueryRow(ctx, `select 1 from workspaces where id = $1 and user_id = $2`, id, userID).Scan(&x)
}

// Test is one check. Browser and harness problems use Code (the body of an async function); stdio problems use Input and Expected.
type Test struct {
	Name     string `json:"name"`
	Code     string `json:"code,omitempty"`
	Input    string `json:"input,omitempty"`
	Expected string `json:"expected,omitempty"`
	Hidden   bool   `json:"hidden"`
}

type Files map[string]string

// Summary is a row of the problem list.
type Summary struct {
	ID         string `json:"id"`
	Kind       string `json:"kind"`
	Language   string `json:"language"`
	Title      string `json:"title"`
	Difficulty string `json:"difficulty"`
	Solved     bool   `json:"solved"`
	Attempted  bool   `json:"attempted"`
}

func list(ctx context.Context, db DB, workspaceID, topic, kind string) ([]Summary, error) {
	rows, err := db.Query(ctx,
		`select p.id, p.kind, p.language, p.title, p.difficulty,
		        exists (select 1 from code_attempts a where a.problem_id = p.id and a.workspace_id = $1 and a.passed = a.total),
		        exists (select 1 from code_attempts a where a.problem_id = p.id and a.workspace_id = $1)
		 from code_problems p
		 where p.topic_key = $2 and ($3 = '' or p.kind = $3)
		 order by case p.difficulty when 'easy' then 0 when 'medium' then 1 else 2 end, p.created_at, p.title`, workspaceID, topic, kind)
	if err != nil {
		return nil, err
	}
	out, err := pgx.CollectRows(rows, pgx.RowToStructByPos[Summary])
	if out == nil {
		out = []Summary{}
	}
	return out, err
}

// Problem is what a learner receives. The solution is not part of it.
type Problem struct {
	Summary
	Topic     string `json:"topic"`
	TopicName string `json:"topicName"`
	Statement string `json:"statement"`
	Hint      string `json:"hint"`
	Starter   Files  `json:"starter"`
	// Runner is "browser" or "server". Browser problems send every test, hidden ones included, because they run in the
	// learner's browser (the UI never shows a hidden test's code). Server problems send only the visible tests; the
	// rest stay on the server.
	Runner      string   `json:"runner"`
	Tests       []Test   `json:"tests"`
	HiddenCount int      `json:"hiddenCount"`
	Languages   []string `json:"languages"`
	// Last: the files from the latest attempt, if any.
	Last Files `json:"last"`
}

func get(ctx context.Context, db DB, workspaceID, id string) (Problem, error) {
	var p Problem
	var starter, tests []byte
	err := db.QueryRow(ctx,
		`select p.id, p.kind, p.language, p.title, p.difficulty,
		        exists (select 1 from code_attempts a where a.problem_id = p.id and a.workspace_id = $1 and a.passed = a.total),
		        exists (select 1 from code_attempts a where a.problem_id = p.id and a.workspace_id = $1),
		        p.topic_key, t.name, p.statement, p.hint, p.starter, p.tests, p.runner
		 from code_problems p join mcq_topics t on t.key = p.topic_key where p.id = $2`, workspaceID, id).
		Scan(&p.ID, &p.Kind, &p.Language, &p.Title, &p.Difficulty, &p.Solved, &p.Attempted, &p.Topic, &p.TopicName, &p.Statement, &p.Hint, &starter, &tests, &p.Runner)
	if err != nil {
		return p, err
	}
	if err := json.Unmarshal(starter, &p.Starter); err != nil {
		return p, err
	}
	if err := json.Unmarshal(tests, &p.Tests); err != nil {
		return p, err
	}
	if p.Runner == RunnerServer {
		p.Tests, p.HiddenCount = publicTests(p.Language, p.Tests)
		p.Languages = languagesFor(p.Language)
	}
	var last []byte
	err = db.QueryRow(ctx, `select files from code_attempts where workspace_id = $1 and problem_id = $2 order by created_at desc limit 1`, workspaceID, id).Scan(&last)
	if err == nil {
		_ = json.Unmarshal(last, &p.Last)
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return p, err
	}
	return p, nil
}

type AttemptInput struct {
	Files  Files `json:"files"`
	Passed int   `json:"passed"`
	Total  int   `json:"total"`
}

// addAttempt stores a result reported by the learner's browser. Practice feedback, not an assessment.
// Problems that run on the server are scored by the server, never by the browser.
func addAttempt(ctx context.Context, db DB, workspaceID, id string, in AttemptInput) error {
	var tests []byte
	var runner string
	if err := db.QueryRow(ctx, `select tests, runner from code_problems where id = $1`, id).Scan(&tests, &runner); err != nil {
		return err
	}
	if runner != RunnerBrowser {
		return errServerScored
	}
	var list []Test
	if err := json.Unmarshal(tests, &list); err != nil {
		return err
	}
	if in.Total != len(list) {
		return errBadAttempt
	}
	return insertAttempt(ctx, db, workspaceID, id, in.Files, "", in.Passed, in.Total)
}

func insertAttempt(ctx context.Context, db DB, workspaceID, id string, f Files, language string, passed, total int) error {
	files, _ := json.Marshal(f)
	_, err := db.Exec(ctx, `insert into code_attempts (workspace_id, problem_id, files, passed, total, language) values ($1, $2, $3, $4, $5, nullif($6, ''))`, workspaceID, id, files, passed, total, language)
	return err
}

var (
	errBadAttempt   = errors.New("bad attempt")
	errServerScored = errors.New("scored by the server")
)

// validate checks an attempt before it is stored.
func (in AttemptInput) validate() map[string]string {
	errs := map[string]string{}
	size := 0
	for name, content := range in.Files {
		size += len(name) + len(content)
		if name == "" || len(name) > 80 {
			errs["files"] = "Invalid file name."
		}
	}
	switch {
	case len(in.Files) == 0 || len(in.Files) > 10:
		errs["files"] = "Send between 1 and 10 files."
	case size > maxFilesBytes:
		errs["files"] = "The code is too large (100 KB at most)."
	}
	if in.Total < 1 || in.Passed < 0 || in.Passed > in.Total {
		errs["passed"] = "Invalid result."
	}
	return errs
}

// solution is available only after the learner has tried the problem.
func solution(ctx context.Context, db DB, workspaceID, id string) (Files, error) {
	var raw []byte
	var attempted bool
	err := db.QueryRow(ctx,
		`select p.solution, exists (select 1 from code_attempts a where a.problem_id = p.id and a.workspace_id = $1)
		 from code_problems p where p.id = $2`, workspaceID, id).Scan(&raw, &attempted)
	if err != nil {
		return nil, err
	}
	if !attempted {
		return nil, errNoAttempt
	}
	var f Files
	return f, json.Unmarshal(raw, &f)
}
