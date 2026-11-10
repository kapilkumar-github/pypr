package tracker

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

// These tests need a disposable Postgres: TEST_DATABASE_URL=postgres://… go test ./internal/tracker
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
	NewHandler(pool, log, NewFetcher(nil)).Register(mux, ah.RequireUser, ah.RequireVerified)
	srv := httptest.NewServer(httpx.RequireJSON(mux))
	t.Cleanup(srv.Close)
	return &env{t, srv, pool}
}

type client struct {
	e     *env
	token string
	id    string
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

func (c *client) resume(title, data string) string {
	var id string
	if err := c.e.pool.QueryRow(context.Background(),
		`insert into resumes (user_id, title, data) values ($1, $2, $3) returning id`, c.id, title, data).Scan(&id); err != nil {
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

func (c *client) job(in map[string]any) Detail {
	var d Detail
	c.do("POST", "/api/tracked-jobs", in, &d, 201)
	return d
}

func jobPath(id string, rest ...string) string {
	p := "/api/tracked-jobs/" + id
	for _, r := range rest {
		p += "/" + r
	}
	return p
}

func TestOwnership(t *testing.T) {
	e := newEnv(t)
	a, b := e.user(), e.user()
	aResume := a.resume("A resume", `{}`)
	job := a.job(map[string]any{"company": "Acme", "title": "Engineer", "note": "first note"})
	var withChildren Detail
	a.do("POST", jobPath(job.ID, "interviews"), map[string]any{"round": "Screen"}, &withChildren, 200)
	noteID, interviewID := withChildren.Notes[0].ID, withChildren.Interviews[0].ID

	// Another user sees nothing and changes nothing.
	b.do("GET", jobPath(job.ID), nil, nil, 404)
	b.do("PUT", jobPath(job.ID), map[string]any{"company": "X", "title": "Y"}, nil, 404)
	b.do("PUT", jobPath(job.ID, "status"), map[string]any{"status": "rejected"}, nil, 404)
	b.do("POST", jobPath(job.ID, "apply"), map[string]any{"resume": map[string]any{"kind": "none"}}, nil, 404)
	b.do("PUT", jobPath(job.ID, "next-action"), map[string]any{"text": "x"}, nil, 404)
	b.do("POST", jobPath(job.ID, "notes"), map[string]any{"body": "x"}, nil, 404)
	b.do("PUT", jobPath(job.ID, "notes", noteID), map[string]any{"body": "x"}, nil, 404)
	b.do("DELETE", jobPath(job.ID, "interviews", interviewID), nil, nil, 404)
	b.do("DELETE", jobPath(job.ID), nil, nil, 404)
	var page Page
	b.do("GET", "/api/tracked-jobs", nil, &page, 200)
	if page.Total != 0 {
		t.Fatalf("other user's list has %d jobs", page.Total)
	}

	// Nested rows can't be reached through one's own job either.
	bJob := b.job(map[string]any{"company": "Bco", "title": "Dev"})
	b.do("PUT", jobPath(bJob.ID, "notes", noteID), map[string]any{"body": "hijack"}, nil, 404)
	b.do("DELETE", jobPath(bJob.ID, "interviews", interviewID), nil, nil, 404)

	// Someone else's resume can't be selected, attached or snapshotted.
	b.do("POST", "/api/tracked-jobs", map[string]any{"company": "B", "title": "T", "resumeId": aResume}, nil, 422)
	b.do("PUT", jobPath(bJob.ID), map[string]any{"company": "B", "title": "T", "resumeId": aResume}, nil, 422)
	b.do("POST", jobPath(bJob.ID, "apply"), map[string]any{"resume": map[string]any{"kind": "pypr", "resumeId": aResume}}, nil, 422)
	var bAfter Detail
	b.do("GET", jobPath(bJob.ID), nil, &bAfter, 200)
	if bAfter.Status != "saved" || bAfter.AppliedAt != nil || len(bAfter.Resumes) != 0 {
		t.Fatalf("failed apply must change nothing: %+v", bAfter.Job)
	}

	// Snapshots are only readable through their own job by its owner.
	a.do("POST", jobPath(job.ID, "apply"), map[string]any{"resume": map[string]any{"kind": "pypr", "resumeId": aResume}}, &withChildren, 200)
	sid := withChildren.Resumes[0].ID
	a.do("GET", jobPath(job.ID, "resumes", sid), nil, nil, 200)
	b.do("GET", jobPath(job.ID, "resumes", sid), nil, nil, 404)
	b.do("GET", jobPath(bJob.ID, "resumes", sid), nil, nil, 404)

	// The owner's copy is untouched.
	var got Detail
	a.do("GET", jobPath(job.ID), nil, &got, 200)
	if got.Company != "Acme" || len(got.Notes) != 1 || got.Notes[0].Body != "first note" || len(got.Interviews) != 1 {
		t.Fatalf("owner's job changed: %+v", got)
	}
}

func TestStatusHistoryAndAppliedDate(t *testing.T) {
	e := newEnv(t)
	c := e.user()
	job := c.job(map[string]any{"company": "Acme", "title": "Engineer"})
	if len(job.History) != 1 || job.History[0].From != nil || job.History[0].To != "saved" {
		t.Fatalf("creation history: %+v", job.History)
	}

	var d Detail
	c.do("PUT", jobPath(job.ID, "status"), map[string]any{"status": "preparing"}, &d, 200)
	// Opening a link or picking Applied isn't applying: the first move to applied needs confirmation.
	c.do("PUT", jobPath(job.ID, "status"), map[string]any{"status": "applied"}, nil, 409)

	when := time.Date(2026, 3, 2, 15, 4, 0, 0, time.UTC)
	c.do("POST", jobPath(job.ID, "apply"), map[string]any{"appliedAt": when, "resume": map[string]any{"kind": "none"}}, &d, 200)
	if d.Status != "applied" || d.AppliedAt == nil || !d.AppliedAt.Equal(when) {
		t.Fatalf("after apply: status %s applied %v", d.Status, d.AppliedAt)
	}
	if len(d.Resumes) != 1 || d.Resumes[0].Kind != "none" || !d.Resumes[0].AtSubmission {
		t.Fatalf("submission record: %+v", d.Resumes)
	}
	c.do("POST", jobPath(job.ID, "apply"), map[string]any{"resume": map[string]any{"kind": "none"}}, nil, 409)

	for _, s := range []string{"interviewing", "rejected", "saved", "applied"} {
		c.do("PUT", jobPath(job.ID, "status"), map[string]any{"status": s}, &d, 200)
		if d.AppliedAt == nil || !d.AppliedAt.Equal(when) {
			t.Fatalf("status %s changed the applied date to %v", s, d.AppliedAt)
		}
	}
	want := []string{"saved", "preparing", "applied", "interviewing", "rejected", "saved", "applied"}
	if len(d.History) != len(want) {
		t.Fatalf("history has %d events, want %d", len(d.History), len(want))
	}
	for i, ev := range d.History {
		if ev.To != want[i] || (i > 0 && (ev.From == nil || *ev.From != want[i-1])) {
			t.Fatalf("event %d: %+v, want %s", i, ev, want[i])
		}
	}
	// Same status again records nothing.
	c.do("PUT", jobPath(job.ID, "status"), map[string]any{"status": "applied"}, &d, 200)
	if len(d.History) != len(want) {
		t.Fatal("no-op status change was recorded")
	}

	// The applied date can be corrected, not removed.
	fixed := when.Add(-48 * time.Hour)
	c.do("PUT", jobPath(job.ID), map[string]any{"company": "Acme", "title": "Engineer", "appliedAt": fixed}, &d, 200)
	if !d.AppliedAt.Equal(fixed) {
		t.Fatalf("correction not saved: %v", d.AppliedAt)
	}
	c.do("PUT", jobPath(job.ID), map[string]any{"company": "Acme", "title": "Engineer"}, nil, 422)

	// Recording a submission late keeps a later status.
	late := c.job(map[string]any{"company": "Beta", "title": "Engineer"})
	c.do("PUT", jobPath(late.ID, "status"), map[string]any{"status": "interviewing"}, nil, 200)
	c.do("POST", jobPath(late.ID, "apply"), map[string]any{"resume": map[string]any{"kind": "external", "label": "cv.pdf"}}, &d, 200)
	if d.Status != "interviewing" || d.AppliedAt == nil {
		t.Fatalf("late apply: status %s applied %v", d.Status, d.AppliedAt)
	}
}

func TestResumeSnapshotImmutable(t *testing.T) {
	e := newEnv(t)
	c := e.user()
	original := `{"personalInfo":{"name":"Ada"},"settings":{"template":"classic","accent":"#123456"}}`
	rid := c.resume("Backend CV", original)
	job := c.job(map[string]any{"company": "Acme", "title": "Engineer", "status": "preparing", "resumeId": rid})
	if job.ResumeID == nil || *job.ResumeID != rid || job.ResumeTitle == nil || *job.ResumeTitle != "Backend CV" {
		t.Fatalf("selected resume: %+v", job.Job)
	}
	// Attaching before applying isn't allowed; the selection is what's being prepared.
	c.do("POST", jobPath(job.ID, "resumes"), map[string]any{"kind": "pypr", "resumeId": rid}, nil, 409)

	var d Detail
	c.do("POST", jobPath(job.ID, "apply"), map[string]any{"resume": map[string]any{"kind": "pypr", "resumeId": rid}}, &d, 200)
	sid := d.Resumes[0].ID

	ctx := context.Background()
	if _, err := e.pool.Exec(ctx, `update resumes set title = 'Renamed', data = '{"personalInfo":{"name":"Changed"}}' where id = $1`, rid); err != nil {
		t.Fatal(err)
	}
	var s Snapshot
	c.do("GET", jobPath(job.ID, "resumes", sid), nil, &s, 200)
	if s.Title != "Backend CV" || !jsonEqual(t, s.Data, original) || !s.AtSubmission {
		t.Fatalf("snapshot changed with the resume: %s %s", s.Title, s.Data)
	}

	// The database refuses edits to a snapshot.
	if _, err := e.pool.Exec(ctx, `update job_resume_snapshots set data = '{}' where id = $1`, sid); err == nil {
		t.Fatal("snapshot data was updated")
	}

	// A resume added later is labelled so.
	c.do("POST", jobPath(job.ID, "resumes"), map[string]any{"kind": "pypr", "resumeId": rid}, &d, 200)
	if len(d.Resumes) != 2 || d.Resumes[1].AtSubmission {
		t.Fatalf("later resume should not be marked as submitted: %+v", d.Resumes)
	}

	// Deleting the resume keeps the snapshot usable.
	if _, err := e.pool.Exec(ctx, `delete from resumes where id = $1`, rid); err != nil {
		t.Fatal(err)
	}
	c.do("GET", jobPath(job.ID, "resumes", sid), nil, &s, 200)
	if s.ResumeID != nil || !jsonEqual(t, s.Data, original) {
		t.Fatalf("snapshot after resume deletion: %+v", s)
	}
	c.do("GET", jobPath(job.ID), nil, &d, 200)
	if d.ResumeID != nil {
		t.Fatal("selection should clear when the resume is deleted")
	}
}

func jsonEqual(t *testing.T, got json.RawMessage, want string) bool {
	var a, b any
	if json.Unmarshal(got, &a) != nil || json.Unmarshal([]byte(want), &b) != nil {
		t.Fatalf("bad json: %s", got)
	}
	x, _ := json.Marshal(a)
	y, _ := json.Marshal(b)
	return bytes.Equal(x, y)
}

func TestDuplicates(t *testing.T) {
	e := newEnv(t)
	a, b := e.user(), e.user()
	saved := a.job(map[string]any{"company": "Acme", "title": "Backend Engineer", "source": "greenhouse", "externalId": "100",
		"discoveryUrl": "https://www.linkedin.com/jobs/view/1", "applicationUrl": "https://boards.greenhouse.io/acme/jobs/100"})
	b.job(map[string]any{"company": "Acme", "title": "Backend Engineer", "discoveryUrl": "https://acme.com/jobs/x"})

	check := func(c *client, q map[string]any) []Duplicate {
		var out struct{ Duplicates []Duplicate }
		c.do("POST", "/api/tracked-jobs/duplicates", q, &out, 200)
		return out.Duplicates
	}
	if d := check(a, map[string]any{"discoveryUrl": "https://boards.greenhouse.io/acme/jobs/100?gh_src=abc&utm_source=x"}); len(d) != 1 || d[0].ID != saved.ID || d[0].Reason != "url" {
		t.Fatalf("url match: %+v", d)
	}
	if d := check(a, map[string]any{"source": "greenhouse", "externalId": "100", "company": "ACME"}); len(d) != 1 || d[0].Reason != "external_id" {
		t.Fatalf("ats id match: %+v", d)
	}
	if d := check(a, map[string]any{"company": "acme", "title": "backend engineer"}); len(d) != 1 || d[0].Reason != "company_title" {
		t.Fatalf("weak match: %+v", d)
	}
	// Another posting of the same title on the same ATS is a separate role.
	if d := check(a, map[string]any{"company": "Acme", "title": "Backend Engineer", "source": "greenhouse", "externalId": "101"}); len(d) != 0 {
		t.Fatalf("separate role flagged: %+v", d)
	}
	if d := check(a, map[string]any{"company": "Acme", "title": "Frontend Engineer"}); len(d) != 0 {
		t.Fatalf("different title flagged: %+v", d)
	}
	// Scoped to the user: b's identical job is not reported to a, and a's job is not reported to b.
	if d := check(a, map[string]any{"discoveryUrl": "https://acme.com/jobs/x"}); len(d) != 0 {
		t.Fatalf("other user's job reported: %+v", d)
	}
	if d := check(b, map[string]any{"applicationUrl": "https://boards.greenhouse.io/acme/jobs/100"}); len(d) != 0 {
		t.Fatalf("other user's job reported: %+v", d)
	}
	// Editing a job doesn't flag itself.
	if d := check(a, map[string]any{"excludeId": saved.ID, "company": "Acme", "title": "Backend Engineer"}); len(d) != 0 {
		t.Fatalf("job matched itself: %+v", d)
	}
	// A warning never blocks saving.
	a.job(map[string]any{"company": "Acme", "title": "Backend Engineer", "applicationUrl": "https://boards.greenhouse.io/acme/jobs/100"})
}

func TestListFiltersAndValidation(t *testing.T) {
	e := newEnv(t)
	c := e.user()
	c.job(map[string]any{"company": "Acme", "title": "Engineer", "workArrangement": "remote", "source": "lever"})
	c.job(map[string]any{"company": "Beta", "title": "Designer", "workArrangement": "onsite"})
	c.job(map[string]any{"company": "Gamma", "title": "100%_Engineer"})
	var p Page
	c.do("GET", "/api/tracked-jobs?q=engineer&arrangement=remote", nil, &p, 200)
	if p.Total != 1 || p.Items[0].Company != "Acme" {
		t.Fatalf("filtered list: %+v", p)
	}
	c.do("GET", "/api/tracked-jobs?q=%25_", nil, &p, 200)
	if p.Total != 1 || p.Items[0].Company != "Gamma" {
		t.Fatalf("wildcards must match literally: %+v", p)
	}
	c.do("GET", "/api/tracked-jobs?limit=2&sort=created", nil, &p, 200)
	if p.Total != 3 || len(p.Items) != 2 || p.Next == nil || *p.Next != 2 || p.Items[0].Company != "Gamma" {
		t.Fatalf("first page: %+v", p)
	}
	c.do("GET", "/api/tracked-jobs?limit=2&offset=2&sort=created", nil, &p, 200)
	if len(p.Items) != 1 || p.Next != nil {
		t.Fatalf("last page: %+v", p)
	}
	c.do("GET", "/api/tracked-jobs?limit=500", nil, nil, 422)
	c.do("POST", "/api/tracked-jobs", map[string]any{"company": "", "title": ""}, nil, 422)
	c.do("POST", "/api/tracked-jobs", map[string]any{"company": "A", "title": "B", "status": "applied"}, nil, 422)
	c.do("POST", "/api/job-extractions", map[string]any{"url": "javascript:alert(1)"}, nil, 422)
	var ex Extraction
	c.do("POST", "/api/job-extractions", map[string]any{"url": "http://127.0.0.1/admin"}, &ex, 200)
	if ex.Status != "failed" || ex.Reason != "blocked_url" {
		t.Fatalf("internal URL: %+v", ex)
	}
}
