package workspace

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
)

// These tests need a disposable Postgres: TEST_DATABASE_URL=postgres://… go test ./internal/workspace
type env struct {
	t    *testing.T
	srv  *httptest.Server
	pool *pgxpool.Pool
}

func newEnv(t *testing.T) *env {
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
	log := slog.New(slog.DiscardHandler)
	svc, err := auth.NewService(auth.PGStore{DB: pool}, &email.Fake{}, "http://localhost", log)
	if err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	ah := auth.NewHandler(svc, log, false)
	ah.Register(mux)
	NewHandler(pool, log, Fake{}).Register(mux, ah.RequireUser, ah.RequireVerified)
	srv := httptest.NewServer(httpx.RequireJSON(mux))
	t.Cleanup(srv.Close)
	return &env{t, srv, pool}
}

type client struct {
	e     *env
	token string
	id    string
}

// user signs up a verified user with one resume.
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

func (c *client) resume(title string) string {
	var id string
	if err := c.e.pool.QueryRow(context.Background(),
		`insert into resumes (user_id, title, data) values ($1, $2, '{}') returning id`, c.id, title).Scan(&id); err != nil {
		c.e.t.Fatal(err)
	}
	return id
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
	if out != nil {
		if err := json.NewDecoder(res.Body).Decode(out); err != nil {
			c.e.t.Fatal(err)
		}
	}
}

func byTitle(plan []Activity, title string) Activity {
	for _, a := range plan {
		if a.Title == title {
			return a
		}
	}
	return Activity{}
}

// Scenarios B, C, D and E from docs/workspaces.md.
func TestWorkspaceFlow(t *testing.T) {
	e := newEnv(t)
	ada := e.user()
	resume := ada.resume("Backend resume")

	// D: one resume, two workspaces, no copy.
	var backend, manager Workspace
	ada.do("POST", "/api/workspaces", map[string]any{
		"targetRole": "Lead Backend Engineer", "seniority": "Lead", "technologies": []string{"Go", "Node.js"},
		"resumeIds": []string{resume}, "modules": []string{"mock_interviews"},
		"skills": []map[string]string{{"name": "Database sharding", "area": "Databases"}, {"name": "Go concurrency"}},
	}, &backend, 201)
	ada.do("POST", "/api/workspaces", map[string]any{
		"targetRole": "Engineering Manager", "track": "management", "resumeIds": []string{resume},
		"skills": []map[string]string{{"name": "Database sharding"}},
	}, &manager, 201)
	if len(backend.Resumes) != 1 || len(manager.Resumes) != 1 || backend.Resumes[0].ID != resume {
		t.Fatalf("resume not linked: %+v / %+v", backend.Resumes, manager.Resumes)
	}
	var resumes int
	_ = e.pool.QueryRow(context.Background(), `select count(*) from resumes where user_id = $1`, ada.id).Scan(&resumes)
	if resumes != 1 {
		t.Fatalf("resume was copied: %d resumes", resumes)
	}

	// Knowledge is shared: a level set once shows in both workspaces.
	ada.do("PUT", "/api/skills/database-sharding", map[string]string{"selfLevel": "beginner"}, nil, 200)
	ada.do("GET", "/api/workspaces/"+manager.ID, nil, &manager, 200)
	if manager.Skills[0].SelfLevel != "beginner" || manager.Skills[0].DemonstratedLevel != nil {
		t.Fatalf("shared level not visible: %+v", manager.Skills)
	}

	// B: a hand-written plan.
	var plan []Activity
	acts := []map[string]any{}
	for _, c := range []string{"Go concurrency", "Database indexing", "Database sharding", "Caching strategies", "Kafka"} {
		acts = append(acts, map[string]any{"kind": "concept", "title": "Learn " + c, "progress": "check"})
	}
	acts = append(acts, map[string]any{"kind": "mock_interview", "title": "Complete 3 mock interviews", "progress": "count", "target": 3})
	ada.do("POST", "/api/workspaces/"+backend.ID+"/activities", map[string]any{"activities": acts}, &plan, 200)
	if len(plan) != 6 || plan[5].Position != 5 {
		t.Fatalf("plan not created in order: %+v", plan)
	}
	mocks := byTitle(plan, "Complete 3 mock interviews")
	path := "/api/workspaces/" + backend.ID + "/activities/" + mocks.ID
	for i := 1; i <= 3; i++ {
		ada.do("POST", path+"/completions", map[string]string{"note": fmt.Sprintf("Mock %d", i)}, &plan, 200)
		m := byTitle(plan, mocks.Title)
		want := map[bool]string{true: "done", false: "in_progress"}[i == 3]
		if m.Completed != i || m.Status != want {
			t.Fatalf("after %d completions: %d %s", i, m.Completed, m.Status)
		}
	}
	ada.do("POST", path+"/completions", nil, nil, 409)
	last := byTitle(plan, mocks.Title).Completions[2].ID
	ada.do("DELETE", path+"/completions/"+last, nil, &plan, 200)
	if m := byTitle(plan, mocks.Title); m.Completed != 2 || m.Status != "in_progress" || m.CompletedAt != nil {
		t.Fatalf("undo: %+v", m)
	}

	// A count activity can't be marked done by hand.
	ada.do("PUT", path, map[string]any{"kind": "mock_interview", "title": mocks.Title, "progress": "count", "target": 3, "status": "done"}, &plan, 200)
	if byTitle(plan, mocks.Title).Status != "in_progress" {
		t.Fatal("count activity marked done without completions")
	}

	// E: a module's session counts once.
	ok, err := RecordCompletion(context.Background(), e.pool, ada.id, backend.ID, mocks.ID, "mock_interview", "session-1")
	if err != nil || !ok {
		t.Fatalf("first report: %v %v", ok, err)
	}
	ok, err = RecordCompletion(context.Background(), e.pool, ada.id, backend.ID, mocks.ID, "mock_interview", "session-1")
	if err != nil || ok {
		t.Fatalf("repeat report counted: %v %v", ok, err)
	}
	ada.do("GET", "/api/workspaces/"+backend.ID+"/activities", nil, &plan, 200)
	if m := byTitle(plan, mocks.Title); m.Completed != 3 || m.Status != "done" {
		t.Fatalf("module completion: %+v", m)
	}
	// Module completions can't be undone as manual ones.
	ada.do("DELETE", path+"/completions/"+byTitle(plan, mocks.Title).Completions[2].ID, nil, nil, 404)

	// Reorder needs exactly the plan.
	ids := []string{}
	for i := len(plan) - 1; i >= 0; i-- {
		ids = append(ids, plan[i].ID)
	}
	ada.do("PUT", "/api/workspaces/"+backend.ID+"/activities/order", map[string]any{"ids": ids[1:]}, nil, 409)
	ada.do("PUT", "/api/workspaces/"+backend.ID+"/activities/order", map[string]any{"ids": ids}, &plan, 200)
	if plan[0].ID != ids[0] {
		t.Fatal("reorder ignored")
	}

	// C: plans are independent.
	var other []Activity
	ada.do("GET", "/api/workspaces/"+manager.ID+"/activities", nil, &other, 200)
	if len(other) != 0 {
		t.Fatalf("plans leak between workspaces: %d", len(other))
	}
	var list []Summary
	ada.do("GET", "/api/workspaces", nil, &list, 200)
	if len(list) != 2 || list[0].ID != backend.ID || list[0].Total != 6 || list[0].Done != 1 {
		t.Fatalf("list: %+v", list)
	}

	// Context changes are versioned; an unchanged save is not.
	body := map[string]any{"targetRole": "Lead Backend Engineer", "seniority": "Lead", "technologies": []string{"Go", "Node.js"},
		"resumeIds": []string{resume}, "modules": []string{"mock_interviews"},
		"skills": []map[string]string{{"name": "Database sharding"}, {"name": "Go concurrency"}}}
	var ws Workspace
	ada.do("PUT", "/api/workspaces/"+backend.ID, body, &ws, 200)
	if ws.ContextVersion != 1 {
		t.Fatalf("unchanged save bumped the version: %d", ws.ContextVersion)
	}
	body["technologies"] = []string{"Go"}
	ada.do("PUT", "/api/workspaces/"+backend.ID, body, &ws, 200)
	if ws.ContextVersion != 2 {
		t.Fatalf("change not versioned: %d", ws.ContextVersion)
	}

	// Suggestions come from rules and skip what's planned.
	var sug struct{ Activities []ActivityInput }
	ada.do("GET", "/api/workspaces/"+backend.ID+"/suggestions", nil, &sug, 200)
	for _, a := range sug.Activities {
		if a.Title == "Complete 3 mock interviews" || (a.SkillKey != nil && *a.SkillKey == "database-sharding") {
			t.Fatalf("suggested a planned activity: %+v", a)
		}
	}

	// Deleting a resume unlinks it and keeps the workspace.
	if _, err := e.pool.Exec(context.Background(), `delete from resumes where id = $1`, resume); err != nil {
		t.Fatal(err)
	}
	ada.do("GET", "/api/workspaces/"+manager.ID, nil, &manager, 200)
	if len(manager.Resumes) != 0 {
		t.Fatal("deleted resume still linked")
	}
}

func TestWorkspaceIsolation(t *testing.T) {
	e := newEnv(t)
	ada, bob := e.user(), e.user()
	bobResume := bob.resume("Bob's resume")

	var ws Workspace
	ada.do("POST", "/api/workspaces", map[string]any{"targetRole": "Backend Engineer", "resumeIds": []string{bobResume}}, nil, 422)
	ada.do("POST", "/api/workspaces", map[string]any{"targetRole": "Backend Engineer"}, nil, 422) // a resume is required
	ada.do("POST", "/api/workspaces", map[string]any{"targetRole": "Backend Engineer", "resumeIds": []string{ada.resume("Ada's resume")}}, &ws, 201)
	var plan []Activity
	ada.do("POST", "/api/workspaces/"+ws.ID+"/activities", map[string]any{"activities": []map[string]any{
		{"kind": "custom", "title": "Private", "progress": "count", "target": 2},
	}}, &plan, 200)
	a := "/api/workspaces/" + ws.ID + "/activities/" + plan[0].ID

	bob.do("GET", "/api/workspaces/"+ws.ID, nil, nil, 404)
	bob.do("GET", "/api/workspaces/"+ws.ID+"/activities", nil, nil, 404)
	bob.do("PUT", "/api/workspaces/"+ws.ID, map[string]any{"targetRole": "Hacked"}, nil, 404)
	bob.do("POST", a+"/completions", nil, nil, 404)
	bob.do("DELETE", a, nil, nil, 404)
	bob.do("DELETE", "/api/workspaces/"+ws.ID, nil, nil, 404)
	bob.do("GET", "/api/workspaces/not-a-uuid", nil, nil, 404)
	var list []Summary
	bob.do("GET", "/api/workspaces", nil, &list, 200)
	if len(list) != 0 {
		t.Fatal("bob sees ada's workspace")
	}

	// Unverified users can read but not write.
	if _, err := e.pool.Exec(context.Background(), `update users set email_verified_at = null where id = $1`, ada.id); err != nil {
		t.Fatal(err)
	}
	ada.do("GET", "/api/workspaces/"+ws.ID, nil, nil, 200)
	ada.do("POST", a+"/completions", nil, nil, 403)

	ada.do("DELETE", "/api/workspaces/"+ws.ID, nil, nil, 403)
	if _, err := e.pool.Exec(context.Background(), `update users set email_verified_at = now() where id = $1`, ada.id); err != nil {
		t.Fatal(err)
	}
	ada.do("DELETE", "/api/workspaces/"+ws.ID, nil, nil, 204)
	var n int
	_ = e.pool.QueryRow(context.Background(), `select count(*) from prep_activities where workspace_id = $1`, ws.ID).Scan(&n)
	if n != 0 {
		t.Fatal("activities left after delete")
	}
}
