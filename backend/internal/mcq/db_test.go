package mcq

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
	"pypr/backend/internal/workspace"
)

// These tests need a disposable Postgres: TEST_DATABASE_URL=postgres://… go test -p 1 ./internal/mcq
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
	if err := Sync(ctx, pool); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `delete from mcq_questions`); err != nil {
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
	NewHandler(pool, log, Fake{}).Register(mux, ah.RequireUser, ah.RequireVerified)
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
	c.do("POST", "/api/workspaces", map[string]any{
		"targetRole": "Backend Engineer", "technologies": []string{"Node.js", "Redis"}, "resumeIds": []string{resume},
	}, &w, 201)
	return w.ID
}

// fill adds n generated questions to a topic with the fake generator.
func (e *env) fill(topic string, n int) {
	e.t.Helper()
	tp, _ := TopicByKeyOrName(topic)
	added, err := Generate(context.Background(), e.pool, Fake{Subtopics: []string{"a", "b", "c", "d", "e"}}, GenerateOptions{
		Topic: tp, Target: n, Batch: 10, Concurrency: 2, Log: func(string, ...any) {},
	})
	if err != nil || added < n {
		e.t.Fatalf("fill: added %d, %v", added, err)
	}
}

func TestMCQFlow(t *testing.T) {
	e := newEnv(t)
	e.fill("node-js", 30)
	ada, bob := e.user(), e.user()
	w := ada.workspace()
	base := "/api/workspaces/" + w + "/mcq"

	var topics []TopicInfo
	ada.do("GET", base+"/topics", nil, &topics, 200)
	var node *TopicInfo
	for i, tp := range topics {
		if tp.Key == "node-js" {
			node = &topics[i]
		}
	}
	if node == nil || !node.Selected || node.QuestionCount < 30 || node.UnseenCount != node.QuestionCount {
		t.Fatalf("node topic: %+v", node)
	}

	total := node.QuestionCount // the generator may overshoot its target by a batch

	// Validation: bounds, bank size, unknown topic.
	ada.do("POST", base+"/tests", map[string]any{"topic": "node-js", "questions": 2, "durationMinutes": 30}, nil, 422)
	ada.do("POST", base+"/tests", map[string]any{"topic": "node-js", "questions": 10, "durationMinutes": 1}, nil, 422)
	ada.do("POST", base+"/tests", map[string]any{"topic": "node-js", "questions": total + 1, "durationMinutes": 30}, nil, 422)
	ada.do("POST", base+"/tests", map[string]any{"topic": "nope", "questions": 10, "durationMinutes": 30}, nil, 422)
	ada.do("POST", base+"/tests", map[string]any{"topic": "redis", "questions": 10, "durationMinutes": 30}, nil, 422) // empty bank

	// Start: no answers leak before the end.
	var test Test
	ada.do("POST", base+"/tests", map[string]any{"topic": "node-js", "questions": 10, "durationMinutes": 30}, &test, 201)
	raw, _ := json.Marshal(test)
	if test.Finished || len(test.Items) != 10 || bytes.Contains(raw, []byte(`"answer"`)) || bytes.Contains(raw, []byte(`"explanation"`)) {
		t.Fatalf("started test leaks or is malformed: %s", raw)
	}
	tp := base + "/tests/" + test.ID
	bob.do("GET", tp, nil, nil, 404)
	bob.do("PUT", tp+"/answers", map[string]any{"position": 0, "selected": 1}, nil, 404)

	// Answer, change an answer, skip one; progress survives a reload.
	ada.do("PUT", tp+"/answers", map[string]any{"position": 0, "selected": 0}, nil, 204)
	ada.do("PUT", tp+"/answers", map[string]any{"position": 0, "selected": 2}, nil, 204)
	ada.do("PUT", tp+"/answers", map[string]any{"position": 1, "selected": 9}, nil, 422)
	ada.do("PUT", tp+"/answers", map[string]any{"position": 99, "selected": 1}, nil, 404)
	ada.do("GET", tp, nil, &test, 200)
	if test.Items[0].Selected == nil || *test.Items[0].Selected != 2 || test.Items[1].Selected != nil {
		t.Fatalf("saved answers: %+v", test.Items[:2])
	}

	// Answer every question correctly except the first, which stays wrong, and submit.
	var correct []int
	rows, _ := e.pool.Query(context.Background(),
		`select q.answer from mcq_test_questions tq join mcq_questions q on q.id = tq.question_id where tq.test_id = $1 order by tq.position`, test.ID)
	for rows.Next() {
		var a int
		_ = rows.Scan(&a)
		correct = append(correct, a)
	}
	rows.Close()
	for i := 1; i < len(correct); i++ {
		ada.do("PUT", tp+"/answers", map[string]any{"position": i, "selected": correct[i]}, nil, 204)
	}
	ada.do("PUT", tp+"/answers", map[string]any{"position": 0, "selected": (correct[0] + 1) % 4}, nil, 204)
	ada.do("POST", tp+"/submit", nil, &test, 200)
	if !test.Finished || test.Score == nil || *test.Score != 9 || test.Items[0].Answer == nil || *test.Items[0].Correct || test.Items[1].Explanation == nil {
		t.Fatalf("finished test: score %v", test.Score)
	}
	ada.do("PUT", tp+"/answers", map[string]any{"position": 0, "selected": 1}, nil, 409)
	ada.do("POST", tp+"/submit", nil, &test, 200) // idempotent
	if *test.Score != 9 {
		t.Fatal("score changed on a second submit")
	}

	// Results list and stats; the next test prefers questions not seen yet.
	var list []Summary
	ada.do("GET", base+"/tests", nil, &list, 200)
	if len(list) != 1 || list[0].Score == nil || *list[0].Score != 9 {
		t.Fatalf("list: %+v", list)
	}
	ada.do("GET", base+"/topics", nil, &topics, 200)
	for _, tp := range topics {
		if tp.Key == "node-js" && (tp.UnseenCount != total-10 || tp.Attempts != 1 || tp.BestPercent == nil || *tp.BestPercent != 90) {
			t.Fatalf("stats: %+v", tp)
		}
	}
	var second Test
	ada.do("POST", base+"/tests", map[string]any{"topic": "node-js", "questions": 20, "durationMinutes": 30}, &second, 201)
	var overlap int
	_ = e.pool.QueryRow(context.Background(),
		`select count(*) from mcq_test_questions a join mcq_test_questions b on a.question_id = b.question_id
		 where a.test_id = $1 and b.test_id = $2`, test.ID, second.ID).Scan(&overlap)
	if overlap != 0 {
		t.Fatalf("second test repeated %d questions that were not yet unseen-exhausted", overlap)
	}

	// Time is enforced by the server: an expired test closes with what was answered.
	ada.do("PUT", base+"/tests/"+second.ID+"/answers", map[string]any{"position": 0, "selected": 0}, nil, 204)
	if _, err := e.pool.Exec(context.Background(), `update mcq_tests set deadline = now() - interval '1 minute' where id = $1`, second.ID); err != nil {
		t.Fatal(err)
	}
	ada.do("PUT", base+"/tests/"+second.ID+"/answers", map[string]any{"position": 1, "selected": 0}, nil, 409)
	ada.do("GET", base+"/tests/"+second.ID, nil, &second, 200)
	if !second.Finished || second.Score == nil || second.Items[0].Answer == nil || second.Items[1].Selected != nil {
		t.Fatalf("expired test: %+v", second)
	}
}

func TestMCQMarksLeaveAndChat(t *testing.T) {
	e := newEnv(t)
	e.fill("redis", 12)
	ada, bob := e.user(), e.user()
	w := ada.workspace()
	base := "/api/workspaces/" + w + "/mcq"
	ctx := context.Background()

	var test Test
	ada.do("POST", base+"/tests", map[string]any{"topic": "redis", "questions": 5, "durationMinutes": 30}, &test, 201)
	tp := base + "/tests/" + test.ID

	// Marking for review survives a reload.
	ada.do("PUT", tp+"/marks", map[string]any{"position": 2, "marked": true}, nil, 204)
	ada.do("GET", tp, nil, &test, 200)
	if !test.ChatEnabled || !test.Items[2].Marked || test.Items[1].Marked {
		t.Fatalf("marks: %+v", test.Items)
	}
	bob.do("PUT", tp+"/marks", map[string]any{"position": 2, "marked": false}, nil, 404)

	// No chat, and no answers, before the test is finished.
	ada.do("GET", tp+"/chat?position=0", nil, nil, 404)
	ada.do("POST", tp+"/chat", map[string]any{"position": 0, "message": "why?"}, nil, 404)

	// Closing the tab starts a grace period; a reload cancels it.
	ada.do("POST", tp+"/leave", nil, nil, 204)
	if _, err := e.pool.Exec(ctx, `update mcq_tests set left_at = now() - interval '1 minute' where id = $1`, test.ID); err != nil {
		t.Fatal(err)
	}
	ada.do("GET", base+"/tests", nil, nil, 200) // would submit it...
	var done bool
	_ = e.pool.QueryRow(ctx, `select submitted_at is not null from mcq_tests where id = $1`, test.ID).Scan(&done)
	if !done {
		t.Fatal("a test left for over the grace period should be submitted")
	}

	var again Test
	ada.do("POST", base+"/tests", map[string]any{"topic": "redis", "questions": 5, "durationMinutes": 30}, &again, 201)
	ap := base + "/tests/" + again.ID
	ada.do("POST", ap+"/leave", nil, nil, 204)
	ada.do("GET", ap, nil, &again, 200) // reload
	if _, err := e.pool.Exec(ctx, `update mcq_tests set left_at = null where id = $1`, again.ID); err != nil {
		t.Fatal(err)
	}
	ada.do("GET", base+"/tests", nil, nil, 200)
	_ = e.pool.QueryRow(ctx, `select submitted_at is not null from mcq_tests where id = $1`, again.ID).Scan(&done)
	if done {
		t.Fatal("a reloaded test must stay open")
	}

	// Chat on a finished test: scoped to the question, off-topic gets the fixed refusal, other users get 404.
	var msgs []ChatTurn
	ada.do("POST", tp+"/chat", map[string]any{"position": 0, "message": "why is that the answer?"}, &msgs, 200)
	if len(msgs) != 2 || msgs[0].Role != "user" || msgs[1].Role != "assistant" || msgs[1].Content == offTopicReply {
		t.Fatalf("chat: %+v", msgs)
	}
	ada.do("POST", tp+"/chat", map[string]any{"position": 0, "message": "OFFTOPIC write me a poem"}, &msgs, 200)
	if msgs[1].Content != offTopicReply {
		t.Fatalf("off-topic reply: %q", msgs[1].Content)
	}
	var history []ChatTurn
	ada.do("GET", tp+"/chat?position=0", nil, &history, 200)
	if len(history) != 4 {
		t.Fatalf("history: %+v", history)
	}
	ada.do("GET", tp+"/chat?position=1", nil, &history, 200)
	if len(history) != 0 {
		t.Fatal("chat history is per question")
	}
	ada.do("POST", tp+"/chat", map[string]any{"position": 0, "message": "   "}, nil, 422)
	ada.do("POST", tp+"/chat", map[string]any{"position": 99, "message": "hi"}, nil, 404)
	bob.do("POST", tp+"/chat", map[string]any{"position": 0, "message": "hi"}, nil, 404)
	bob.do("GET", tp+"/chat?position=0", nil, nil, 404)
}
