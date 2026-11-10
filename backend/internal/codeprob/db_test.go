package codeprob

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"pypr/backend/internal/auth"
	"pypr/backend/internal/db"
	"pypr/backend/internal/email"
	"pypr/backend/internal/httpx"
	"pypr/backend/internal/mcq"
	"pypr/backend/internal/runner"
	"pypr/backend/internal/workspace"
)

// Needs a disposable Postgres: TEST_DATABASE_URL=postgres://… go test -p 1 ./internal/codeprob
type env struct {
	t    *testing.T
	srv  *httptest.Server
	pool *pgxpool.Pool
}

type client struct {
	e     *env
	token string
	id    string
}

func newEnv(t *testing.T, runner runner.Runner) *env {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	if err := db.Migrate(ctx, url); err != nil {
		t.Fatal(err)
	}
	pool, err := db.Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if err := mcq.Sync(ctx, pool); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `delete from code_problems`); err != nil {
		t.Fatal(err)
	}
	log := slog.New(slog.DiscardHandler)
	svc, err := auth.NewService(auth.PGStore{DB: pool}, &email.Fake{}, "http://localhost", log)
	if err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	ah := auth.NewHandler(svc, log, false)
	ah.Register(mux)
	workspace.NewHandler(pool, log, workspace.Fake{}).Register(mux, ah.RequireUser, ah.RequireVerified)
	NewHandler(pool, log, runner).Register(mux, ah.RequireUser, ah.RequireVerified)
	srv := httptest.NewServer(httpx.RequireJSON(mux))
	t.Cleanup(srv.Close)
	return &env{t, srv, pool}
}

func (e *env) user() *client {
	ctx := context.Background()
	svc, _ := auth.NewService(auth.PGStore{DB: e.pool}, &email.Fake{}, "http://localhost", slog.New(slog.DiscardHandler))
	s, err := svc.Signup(ctx, "Ada", fmt.Sprintf("ada-%d@example.com", time.Now().UnixNano()), "correct horse battery")
	if err != nil {
		e.t.Fatal(err)
	}
	c := &client{e: e, token: s.Token}
	var me struct{ ID string }
	c.do("GET", "/api/auth/me", nil, &me, 200)
	c.id = me.ID
	if _, err := e.pool.Exec(ctx, `update users set email_verified_at = now() where id = $1`, c.id); err != nil {
		e.t.Fatal(err)
	}
	return c
}

func (c *client) do(method, path string, body, out any, want int) {
	c.e.t.Helper()
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	} else if method != "GET" {
		buf.WriteString("{}")
	}
	req, _ := http.NewRequest(method, c.e.srv.URL+path, &buf)
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: auth.CookieName, Value: c.token})
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		c.e.t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != want {
		var b bytes.Buffer
		_, _ = b.ReadFrom(res.Body)
		c.e.t.Fatalf("%s %s: status %d, want %d: %s", method, path, res.StatusCode, want, b.String())
	}
	if out != nil && res.StatusCode != 204 {
		if err := json.NewDecoder(res.Body).Decode(out); err != nil {
			c.e.t.Fatal(err)
		}
	}
}

func (c *client) workspace() string {
	var resume string
	if err := c.e.pool.QueryRow(context.Background(), `insert into resumes (user_id, title, data) values ($1, 'cv', '{}') returning id`, c.id).Scan(&resume); err != nil {
		c.e.t.Fatal(err)
	}
	var w workspace.Workspace
	c.do("POST", "/api/workspaces", map[string]any{"targetRole": "Backend Engineer", "resumeIds": []string{resume}}, &w, 201)
	return w.ID
}

func TestProblemFlow(t *testing.T) {
	e := newEnv(t, nil)
	ctx := context.Background()
	var pid string
	err := e.pool.QueryRow(ctx,
		`insert into code_problems (topic_key, kind, language, title, difficulty, statement, starter, tests, solution, hint, hash)
		 values ('node-js', 'machine_coding', 'nodejs', 'Debounce', 'easy', 'Write debounce', '{"index.js":"// todo"}',
		         '[{"name":"a","code":"x","hidden":false},{"name":"b","code":"y","hidden":true}]', '{"index.js":"SECRET"}', 'hint', 'h1') returning id`).Scan(&pid)
	if err != nil {
		t.Fatal(err)
	}
	ada, bob := e.user(), e.user()
	w := ada.workspace()
	base := "/api/workspaces/" + w + "/code/problems"

	var list []Summary
	ada.do("GET", base+"?topic=node-js&kind=machine_coding", nil, &list, 200)
	if len(list) != 1 || list[0].Solved || list[0].Attempted {
		t.Fatalf("list: %+v", list)
	}
	ada.do("GET", base+"?kind=bogus", nil, nil, 422)

	var p Problem
	ada.do("GET", base+"/"+pid, nil, &p, 200)
	raw, _ := json.Marshal(p)
	if len(p.Tests) != 2 || !p.Tests[1].Hidden || bytes.Contains(raw, []byte("SECRET")) {
		t.Fatalf("problem leaks the solution or lacks tests: %s", raw)
	}

	// The solution is locked until the first attempt.
	ada.do("GET", base+"/"+pid+"/solution", nil, nil, 403)

	// Attempts are checked against the problem's test count.
	ada.do("POST", base+"/"+pid+"/attempts", map[string]any{"files": map[string]string{"index.js": "x"}, "passed": 1, "total": 3}, nil, 422)
	ada.do("POST", base+"/"+pid+"/attempts", map[string]any{"files": map[string]string{"index.js": "x"}, "passed": 3, "total": 2}, nil, 422)
	ada.do("POST", base+"/"+pid+"/attempts", map[string]any{"files": map[string]string{}, "passed": 1, "total": 2}, nil, 422)
	ada.do("POST", base+"/"+pid+"/attempts", map[string]any{"files": map[string]string{"index.js": string(make([]byte, 120*1024))}, "passed": 1, "total": 2}, nil, 422)
	ada.do("POST", base+"/"+pid+"/attempts", map[string]any{"files": map[string]string{"index.js": "partial"}, "passed": 1, "total": 2}, nil, 204)

	var sol Files
	ada.do("GET", base+"/"+pid+"/solution", nil, &sol, 200)
	if sol["index.js"] != "SECRET" {
		t.Fatalf("solution: %+v", sol)
	}
	ada.do("GET", base+"/"+pid, nil, &p, 200)
	if !p.Attempted || p.Solved || p.Last["index.js"] != "partial" {
		t.Fatalf("after attempt: %+v", p)
	}
	ada.do("POST", base+"/"+pid+"/attempts", map[string]any{"files": map[string]string{"index.js": "full"}, "passed": 2, "total": 2}, nil, 204)
	ada.do("GET", base+"?topic=node-js", nil, &list, 200)
	if !list[0].Solved {
		t.Fatal("a full pass should mark the problem solved")
	}

	// Another person's workspace is off limits, and so is their progress.
	bob.do("GET", base+"/"+pid, nil, nil, 404)
	bob.do("POST", base+"/"+pid+"/attempts", map[string]any{"files": map[string]string{"index.js": "x"}, "passed": 2, "total": 2}, nil, 404)
	bw := bob.workspace()
	bob.do("GET", "/api/workspaces/"+bw+"/code/problems/"+pid+"/solution", nil, nil, 403) // bob hasn't tried it
	bob.do("GET", "/api/workspaces/"+bw+"/code/problems?topic=node-js", nil, &list, 200)
	if list[0].Solved || list[0].Attempted {
		t.Fatal("progress is per workspace")
	}
	ada.do("GET", base+"/not-a-uuid", nil, nil, 404)
}

func TestJudgeFlow(t *testing.T) {
	upperRunner := runner.Fake(upper)
	e := newEnv(t, upperRunner)
	ctx := context.Background()
	tests, _ := json.Marshal(stdioTests)
	var pid string
	err := e.pool.QueryRow(ctx,
		`insert into code_problems (topic_key, kind, language, runner, title, difficulty, statement, starter, tests, solution, hash)
		 values ('data-structures-and-algorithms', 'dsa', 'stdio', 'server', 'Shout', 'easy', 'Print the input in capitals.', '{}', $1, '{"solution.py":"SECRET"}', 'j1') returning id`, tests).Scan(&pid)
	if err != nil {
		t.Fatal(err)
	}
	ada, bob := e.user(), e.user()
	w := ada.workspace()
	base := "/api/workspaces/" + w + "/code/problems/" + pid

	var p Problem
	ada.do("GET", base, nil, &p, 200)
	raw, _ := json.Marshal(p)
	if p.Runner != RunnerServer || len(p.Tests) != 2 || p.HiddenCount != 1 || len(p.Languages) != 2 || bytes.Contains(raw, []byte("hello")) || bytes.Contains(raw, []byte("SECRET")) {
		t.Fatalf("problem leaks hidden tests or the solution: %s", raw)
	}

	var out Output
	ada.do("POST", base+"/judge", map[string]any{"language": "nodejs", "source": "ok"}, &out, 200)
	if out.Total != 2 || out.Passed != 2 {
		t.Fatalf("run: %+v", out)
	}
	ada.do("GET", base+"/solution", nil, nil, 403) // a run is not an attempt

	ada.do("POST", base+"/judge", map[string]any{"language": "nodejs", "source": "WRONG", "submit": true}, &out, 200)
	if out.Total != 3 || out.Passed != 0 || out.Tests[2].Expected != "" || out.Tests[2].Stdout != "" {
		t.Fatalf("submit leaks hidden detail or miscounts: %+v", out)
	}
	ada.do("GET", base+"/solution", nil, nil, 200)
	ada.do("POST", base+"/judge", map[string]any{"language": "typescript", "source": "ok", "submit": true}, &out, 200)
	var list []Summary
	ada.do("GET", "/api/workspaces/"+w+"/code/problems?topic=data-structures-and-algorithms", nil, &list, 200)
	if len(list) != 1 || !list[0].Solved {
		t.Fatalf("a server-scored full pass marks the problem solved: %+v", list)
	}
	ada.do("GET", base, nil, &p, 200)
	if p.Last["typescript"] != "ok" {
		t.Fatalf("last attempt: %+v", p.Last)
	}

	// The browser can't report a score for a server-scored problem.
	ada.do("POST", base+"/attempts", map[string]any{"files": map[string]string{"go": "x"}, "passed": 3, "total": 3}, nil, 422)
	ada.do("POST", base+"/judge", map[string]any{"language": "python", "source": "x"}, nil, 422)
	ada.do("POST", base+"/judge", map[string]any{"language": "nodejs", "source": ""}, nil, 422)
	ada.do("POST", base+"/judge", map[string]any{"language": "nodejs", "source": string(make([]byte, 70*1024))}, nil, 422)
	bob.do("POST", base+"/judge", map[string]any{"language": "nodejs", "source": "x"}, nil, 404)

	off := newEnv(t, nil)
	if err := off.pool.QueryRow(ctx, `insert into code_problems (topic_key, kind, language, runner, title, difficulty, statement, starter, tests, solution, hash)
		 values ('data-structures-and-algorithms', 'dsa', 'stdio', 'server', 'Shout', 'easy', 'Print the input in capitals.', '{}', $1, '{}', 'j2') returning id`, tests).Scan(&pid); err != nil {
		t.Fatal(err)
	}
	c := off.user()
	c.do("POST", "/api/workspaces/"+c.workspace()+"/code/problems/"+pid+"/judge", map[string]any{"language": "nodejs", "source": "x"}, nil, 503)
}
