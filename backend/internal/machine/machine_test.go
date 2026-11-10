package machine

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"pypr/backend/internal/auth"
	"pypr/backend/internal/codeprob"
	"pypr/backend/internal/db"
	"pypr/backend/internal/design"
	"pypr/backend/internal/email"
	"pypr/backend/internal/httpx"
	"pypr/backend/internal/runner"
	"pypr/backend/internal/workspace"
)

// Needs a disposable Postgres (TEST_DATABASE_URL=postgres://… go test -p 1 ./internal/machine) and, for the judge tests,
// Docker with the runner image.
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

func newEnv(t *testing.T, r runner.Runner) *env {
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
	if _, err := pool.Exec(ctx, `delete from mc_problems`); err != nil {
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
	NewHandler(pool, log, r, Fake{}).Register(mux, ah.RequireUser, ah.RequireVerified)
	design.NewHandler(pool, log, design.Fake{}).Register(mux, ah.RequireUser, ah.RequireVerified)
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

const (
	stage1 = `class RateLimiter {
  constructor({ limit, windowMs, now = Date.now }) { this.limit = limit; this.windowMs = windowMs; this.now = now; this.hits = new Map() }
  allow(key) {
    const t = this.now()
    const live = (this.hits.get(key) || []).filter((x) => x > t - this.windowMs)
    const ok = live.length < this.limit
    if (ok) live.push(t)
    this.hits.set(key, live)
    return ok
  }
}
`
	stage2 = stage1 + `class RedisRateLimiter {
  constructor({ redis, limit, windowMs, now = Date.now, failOpen = true }) { Object.assign(this, { redis, limit, windowMs, now, failOpen }) }
  async allow(key) {
    const k = 'rl:' + key + ':' + Math.floor(this.now() / this.windowMs)
    const n = await this.redis.eval((tx, keys, args) => { const c = tx.incr(keys[0]); if (c === 1) tx.pExpire(keys[0], args[0]); return c }, { keys: [k], args: [this.windowMs] })
    return n <= this.limit
  }
}
`
	stage3 = stage1 + `class RedisRateLimiter {
  constructor({ redis, limit, windowMs, now = Date.now, failOpen = true }) { Object.assign(this, { redis, limit, windowMs, now, failOpen }) }
  async allow(key) {
    try {
      const k = 'rl:' + key + ':' + Math.floor(this.now() / this.windowMs)
      const n = await this.redis.eval((tx, keys, args) => { const c = tx.incr(keys[0]); if (c === 1) tx.pExpire(keys[0], args[0]); return c }, { keys: [k], args: [this.windowMs] })
      return n <= this.limit
    } catch (e) {
      return this.failOpen
    }
  }
}
`
)

func rateLimiter() (stages, solutions []byte) {
	st := []Stage{
		{N: 1, Title: "In-memory", Requirements: "R1", Hints: []string{"use a Map"}, Tests: []codeprob.Test{
			{Name: "allows up to the limit", Code: `const l = new RateLimiter({ limit: 2, windowMs: 1000 }); assert.equal(l.allow('a'), true); assert.equal(l.allow('a'), true); assert.equal(l.allow('a'), false)`},
			{Name: "window slides", Hidden: true, Code: `// HIDDEN_CODE_TOKEN
let t = 0; const l = new RateLimiter({ limit: 1, windowMs: 100, now: () => t }); assert.equal(l.allow('a'), true); t = 150; assert.equal(l.allow('a'), true)`},
		}},
		{N: 2, Title: "Shared Redis", Requirements: "R2", Hints: []string{"use eval"}, Tests: []codeprob.Test{
			{Name: "two instances share the limit", Code: `const redis = new FakeRedis(); const a = new RedisRateLimiter({ redis, limit: 2, windowMs: 1000 }); const b = new RedisRateLimiter({ redis, limit: 2, windowMs: 1000 })
assert.equal(await a.allow('u'), true); assert.equal(await b.allow('u'), true); assert.equal(await a.allow('u'), false)`},
		}},
		{N: 3, Title: "Redis down", Requirements: "R3", Hints: []string{"catch"}, Tests: []codeprob.Test{
			{Name: "fails open", Code: `const redis = new FakeRedis(); redis.fail(); const l = new RedisRateLimiter({ redis, limit: 1, windowMs: 1000 }); assert.equal(await l.allow('u'), true)`},
			{Name: "fails closed on request", Hidden: true, Code: `const redis = new FakeRedis(); redis.fail(); const l = new RedisRateLimiter({ redis, limit: 1, windowMs: 1000, failOpen: false }); assert.equal(await l.allow('u'), false)`},
		}},
	}
	a, _ := json.Marshal(st)
	b, _ := json.Marshal(map[string]string{"1": stage1 + "// SECRET_SOLUTION", "2": stage2, "3": stage3})
	return a, b
}

func (e *env) problem() string {
	stages, solutions := rateLimiter()
	var id string
	err := e.pool.QueryRow(context.Background(),
		`insert into mc_problems (slug, category, title, difficulty, summary, statement, requirements, evaluation, followups, starter, prelude, stages, solutions, duration_minutes, hash)
		 values ('rate-limiter', 'utility', 'Rate limiter', 'medium', 'Limit calls per key.', 'Build a rate limiter.', '["a","b"]',
		         '[{"name":"Correctness","description":"d"},{"name":"Concurrency","description":"d"}]', '["Add cancellation"]',
		         '{"index.js":"// starter\nclass RateLimiter { allow() { return true } }\nclass RedisRateLimiter { async allow() { return true } }"}', $1, $2, $3, 60, 'h') returning id`,
		FakeRedisSource, stages, solutions).Scan(&id)
	if err != nil {
		e.t.Fatal(err)
	}
	return id
}

func TestMachineFlow(t *testing.T) {
	d := runner.NewDocker("")
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Minute)
	defer cancel()
	if err := d.Ensure(ctx); err != nil {
		t.Skip(err)
	}
	e := newEnv(t, d)
	pid := e.problem()
	ada, bob := e.user(), e.user()
	w := ada.workspace()
	base := "/api/workspaces/" + w + "/machine"

	var list []Summary
	ada.do("GET", base+"/problems?category=utility", nil, &list, 200)
	if len(list) != 1 || list[0].Stages != 3 || list[0].StagesCleared != 0 {
		t.Fatalf("list: %+v", list)
	}
	ada.do("GET", base+"/problems?category=bogus", nil, nil, 422)
	bob.do("GET", base+"/problems", nil, nil, 404) // not his workspace

	var s Session
	ada.do("POST", base+"/problems/"+pid+"/sessions", map[string]any{"mode": "practice"}, &s, 200)
	var again Session
	ada.do("POST", base+"/problems/"+pid+"/sessions", map[string]any{"mode": "practice"}, &again, 200)
	if s.ID != again.ID {
		t.Fatal("an open practice session is resumed")
	}
	bob.do("GET", base+"/sessions/"+s.ID, nil, nil, 404)
	sbase := base + "/sessions/" + s.ID

	var v SessionView
	ada.do("GET", sbase, nil, &v, 200)
	raw, _ := json.Marshal(v)
	for _, leak := range []string{"HIDDEN_CODE_TOKEN", "SECRET_SOLUTION", "assert.equal", "use a Map", "R2", "R3"} {
		if bytes.Contains(raw, []byte(leak)) {
			t.Fatalf("session view leaks %q: %s", leak, raw)
		}
	}
	st := v.Problem.Stages
	if len(st) != 3 || st[0].Locked || !st[1].Locked || !st[2].Locked || st[0].HiddenCount != 1 || len(st[0].Tests) != 1 || !v.Hints || !strings.Contains(v.Source, "// starter") {
		t.Fatalf("stages: %+v", st)
	}

	// Run checks the visible tests of unlocked stages; a locked stage is refused.
	var res JudgeResult
	ada.do("POST", sbase+"/judge", map[string]any{"stage": 1, "source": stage1}, &res, 200)
	if res.Total != 1 || res.Passed != 1 || res.Cleared {
		t.Fatalf("run: %+v", res)
	}
	ada.do("POST", sbase+"/judge", map[string]any{"stage": 2, "source": stage2}, nil, 422)
	ada.do("POST", sbase+"/judge", map[string]any{"stage": 1, "source": ""}, nil, 422)
	ada.do("GET", sbase+"/solution?stage=1", nil, nil, 403) // a run is not an attempt

	// Submit: starter fails, then the stage-1 solution clears it and unlocks stage 2.
	ada.do("POST", sbase+"/judge", map[string]any{"stage": 1, "source": "class RateLimiter { allow() { return true } }", "submit": true}, &res, 200)
	if res.Total != 2 || res.Passed != 1 || res.Cleared {
		t.Fatalf("starter submit: %+v", res)
	}
	if res.Tests[1].Name != "" || !res.Tests[1].Hidden || res.Tests[1].Error != "" {
		t.Fatalf("hidden test detail leaks: %+v", res.Tests[1])
	}
	ada.do("GET", sbase+"/solution?stage=1", nil, nil, 200)
	ada.do("POST", sbase+"/judge", map[string]any{"stage": 1, "source": stage1, "submit": true}, &res, 200)
	if !res.Cleared || res.StageReached != 1 {
		t.Fatalf("stage 1 submit: %+v", res)
	}
	ada.do("GET", sbase, nil, &v, 200)
	if v.Problem.Stages[1].Locked || !strings.Contains(v.Problem.Stages[1].Requirements, "R2") || !v.Problem.Stages[2].Locked || v.Source != stage1 {
		t.Fatalf("stage 2 should unlock and the editor reopens with the last attempt: %+v", v.Problem.Stages)
	}

	// Stage 2 runs the stage 1 tests too: breaking stage 1 fails the stage.
	broken := strings.Replace(stage2, "ok = live.length < this.limit", "ok = true", 1)
	broken = strings.Replace(broken, "const ok = live.length < this.limit", "const ok = true", 1)
	ada.do("POST", sbase+"/judge", map[string]any{"stage": 2, "source": broken, "submit": true}, &res, 200)
	if res.Cleared || res.Total != 3 {
		t.Fatalf("regression in stage 1 must fail stage 2: %+v", res)
	}
	ada.do("POST", sbase+"/judge", map[string]any{"stage": 2, "source": stage2, "submit": true}, &res, 200)
	if !res.Cleared || res.Total != 3 || res.Tests[2].Stage != 2 {
		t.Fatalf("stage 2: %+v", res)
	}
	ada.do("POST", sbase+"/judge", map[string]any{"stage": 3, "source": stage3, "submit": true}, &res, 200)
	if !res.Cleared || res.StageReached != 3 {
		t.Fatalf("stage 3: %+v", res)
	}

	var hints struct{ Hints []string }
	ada.do("GET", sbase+"/hints?stage=1", nil, &hints, 200)
	if len(hints.Hints) != 1 {
		t.Fatalf("hints: %+v", hints)
	}
	var sol struct{ Source string }
	ada.do("GET", sbase+"/solution?stage=3", nil, &sol, 200)
	if sol.Source != stage3 {
		t.Fatal("solution")
	}
	ada.do("GET", base+"/problems", nil, &list, 200)
	if list[0].StagesCleared != 3 {
		t.Fatalf("progress: %+v", list)
	}

	// Interview: no hints, solution locked, the clock is enforced by the server.
	var iv Session
	ada.do("POST", base+"/problems/"+pid+"/sessions", map[string]any{"mode": "interview", "minutes": 20}, &iv, 200)
	if iv.EndsAt == nil || iv.StageReached != 0 || iv.ID == s.ID {
		t.Fatalf("interview: %+v", iv)
	}
	ibase := base + "/sessions/" + iv.ID
	ada.do("GET", ibase+"/hints?stage=1", nil, nil, 403)
	ada.do("GET", ibase+"/solution?stage=1", nil, nil, 403)
	ada.do("POST", ibase+"/review", nil, nil, 403)
	ada.do("POST", base+"/problems/"+pid+"/sessions", map[string]any{"mode": "interview", "minutes": 5}, nil, 422)
	if _, err := e.pool.Exec(context.Background(), `update mc_sessions set ends_at = now() - interval '1 minute' where id = $1`, iv.ID); err != nil {
		t.Fatal(err)
	}
	ada.do("POST", ibase+"/judge", map[string]any{"stage": 1, "source": stage1}, nil, 403)
	var over SessionView
	ada.do("GET", ibase, nil, &over, 200)
	if over.Session.FinishedAt == nil || len(over.Problem.Followups) != 1 {
		t.Fatalf("a finished interview shows follow-ups: %+v", over.Session)
	}
	ada.do("GET", ibase+"/solution?stage=1", nil, nil, 200)

	// Review: scores the latest attempt against the criteria.
	var rv SessionView
	var rs Session
	ada.do("POST", base+"/problems/"+pid+"/sessions", map[string]any{"mode": "review"}, &rs, 200)
	ada.do("GET", base+"/sessions/"+rs.ID, nil, &rv, 200)
	if rv.Source != stage3 || rv.Problem.Stages[2].Locked {
		t.Fatalf("review opens the last attempt with every stage shown: %+v", rv.Problem.Stages)
	}
	var out ReviewResult
	ada.do("POST", base+"/sessions/"+rs.ID+"/review", nil, &out, 200)
	if len(out.Scores) != 2 || out.Scores[0].Criterion != "Correctness" || len(out.Improvements) != 1 {
		t.Fatalf("review: %+v", out)
	}
	var last ReviewResult
	ada.do("GET", base+"/sessions/"+rs.ID+"/review", nil, &last, 200)
	if last.Summary != out.Summary {
		t.Fatalf("stored review: %+v", last)
	}
	// Review needs an attempt: another workspace has none.
	w2 := ada.workspace()
	ada.do("POST", "/api/workspaces/"+w2+"/machine/problems/"+pid+"/sessions", map[string]any{"mode": "review"}, nil, 422)
}

func TestFakeRedisPrelude(t *testing.T) {
	d := runner.NewDocker("")
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	if err := d.Ensure(ctx); err != nil {
		t.Skip(err)
	}
	src := FakeRedisSource + `
(async () => {
  let t = 1000; const r = new FakeRedis({ now: () => t }); const assert = require('assert')
  assert.equal(await r.set('a', 1, { NX: true, PX: 100 }), 'OK'); assert.equal(await r.set('a', 2, { NX: true }), null)
  assert.equal(await r.get('a'), '1'); assert.equal(await r.pTtl('a'), 100); t += 101; assert.equal(await r.get('a'), null); assert.equal(await r.ttl('a'), -2)
  assert.equal(await r.incr('n'), 1); assert.equal(await r.incrBy('n', 4), 5); assert.equal(await r.ttl('n'), -1); assert.equal(await r.expire('n', 2), 1); assert.equal(await r.ttl('n'), 2)
  assert.equal(await r.eval((tx, keys, args) => { tx.zAdd(keys[0], 1, 'x'); tx.zAdd(keys[0], 2, 'y'); return tx.zRemRangeByScore(keys[0], 0, 1) }, { keys: ['z'] }), 1)
  assert.deepEqual(await r.zRange('z', 0, -1), ['y']); assert.equal(await r.zCard('z'), 1)
  assert.deepEqual(await r.multi().rPush('l', 'a').rPush('l', 'b').lPop('l').exec(), [1, 2, 'a'])
  await r.hSet('h', 'f', 3); assert.equal(await r.hIncrBy('h', 'f', 2), 5); assert.deepEqual(await r.hGetAll('h'), { f: '5' })
  await assert.rejects(r.incr('h'), /WRONGTYPE|not an integer/)
  r.fail(); await assert.rejects(r.get('a'), /FakeRedis: connection refused/); const calls = r.calls; r.recover(); await r.get('a'); assert.equal(r.calls, calls + 1)
  r.delay(30); const t0 = Date.now(); await r.get('a'); assert.ok(Date.now() - t0 >= 25)
  console.log('PRELUDE OK')
})().catch((e) => { console.error(e); process.exit(1) })
`
	res, err := d.Run(ctx, []runner.Job{{Language: "nodejs", Source: src}})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(res[0].Stdout, "PRELUDE OK") {
		t.Fatalf("prelude: %+v", res[0])
	}
}

func TestDesignBoards(t *testing.T) {
	e := newEnv(t, nil)
	ada, bob := e.user(), e.user()
	w := ada.workspace()
	base := "/api/workspaces/" + w + "/design/boards"
	doc := map[string]any{"nodes": []any{map[string]any{"id": "1", "type": "shape", "position": map[string]int{"x": 0, "y": 0}, "data": map[string]string{"kind": "cache", "label": "Redis"}}}, "edges": []any{}}

	var b design.Summary
	ada.do("POST", base, map[string]any{"title": "URL shortener", "promptKey": "url-shortener", "doc": doc}, &b, 201)
	ada.do("POST", base, map[string]any{"title": " ", "doc": doc}, nil, 422)
	ada.do("POST", base, map[string]any{"title": "x", "doc": map[string]any{"nodes": 1}}, nil, 422)
	var boards []design.Summary
	ada.do("GET", base, nil, &boards, 200)
	if len(boards) != 1 || boards[0].PromptKey == nil || *boards[0].PromptKey != "url-shortener" {
		t.Fatalf("boards: %+v", boards)
	}
	var got design.Board
	ada.do("GET", base+"/"+b.ID, nil, &got, 200)
	if !strings.Contains(string(got.Doc), "Redis") {
		t.Fatalf("board: %s", got.Doc)
	}
	doc["nodes"] = []any{}
	ada.do("PUT", base+"/"+b.ID, map[string]any{"title": "Renamed", "doc": doc}, nil, 200)
	ada.do("GET", base+"/"+b.ID, nil, &got, 200)
	if got.Title != "Renamed" || strings.Contains(string(got.Doc), "Redis") {
		t.Fatalf("saved board: %+v %s", got.Summary, got.Doc)
	}
	huge := strings.Repeat("x", 1<<20)
	ada.do("PUT", base+"/"+b.ID, map[string]any{"title": "Big", "doc": map[string]any{"nodes": []any{}, "edges": []any{}, "pad": huge}}, nil, 422)
	bob.do("GET", base, nil, nil, 404)
	bob.do("GET", "/api/workspaces/"+w+"/design/boards/"+b.ID, nil, nil, 404)
	ada.do("DELETE", base+"/"+b.ID, nil, nil, 204)
	ada.do("DELETE", base+"/"+b.ID, nil, nil, 404)
	ada.do("GET", base+"/not-a-uuid", nil, nil, 404)
}

func TestDesignDiscussion(t *testing.T) {
	e := newEnv(t, nil)
	ada, bob := e.user(), e.user()
	w := ada.workspace()
	base := "/api/workspaces/" + w + "/design/boards"
	node := func(id, kind, label string) map[string]any {
		return map[string]any{"id": id, "type": "shape", "position": map[string]int{"x": 0, "y": 0}, "data": map[string]string{"kind": kind, "label": label}}
	}
	doc := map[string]any{
		"nodes": []any{node("1", "loadbalancer", "LB"), node("2", "cache", "Redis")},
		"edges": []any{map[string]any{"id": "e", "source": "1", "target": "2", "label": "reads"}},
		"notes": []any{map[string]any{"id": "n", "title": "Estimates", "text": "10M DAU"}},
	}
	var b design.Summary
	ada.do("POST", base, map[string]any{"title": "Feed", "doc": doc}, &b, 201)
	url := base + "/" + b.ID

	// Notes are bounded.
	many := make([]any, 31)
	for i := range many {
		many[i] = map[string]any{"id": i}
	}
	ada.do("PUT", url, map[string]any{"title": "Feed", "doc": map[string]any{"nodes": []any{}, "edges": []any{}, "notes": many}}, nil, 422)

	var msgs []design.Message
	ada.do("POST", url+"/evaluate", map[string]any{"requirement": "Design a feed", "explanation": "Clients hit the LB."}, &msgs, 200)
	if len(msgs) != 2 || msgs[0].Kind != "explanation" || msgs[1].Kind != "evaluation" {
		t.Fatalf("evaluate: %+v", msgs)
	}
	var ev design.Evaluation
	if err := json.Unmarshal(msgs[1].Result, &ev); err != nil || len(ev.Scores) != len(design.Areas) || len(ev.Followups) != 2 {
		t.Fatalf("evaluation: %+v %v", ev, err)
	}
	if !strings.Contains(msgs[1].Content, "Follow-up questions") {
		t.Fatalf("later turns must see the follow-ups: %q", msgs[1].Content)
	}
	ada.do("POST", url+"/evaluate", map[string]any{"requirement": "Design a feed"}, &msgs, 200)
	if len(msgs) != 1 {
		t.Fatalf("no explanation means one message: %+v", msgs)
	}
	ada.do("POST", url+"/evaluate", map[string]any{"explanation": strings.Repeat("x", 4001)}, nil, 422)

	ada.do("POST", url+"/chat", map[string]any{"message": "We shard by user id.", "requirement": "Design a feed"}, &msgs, 200)
	if len(msgs) != 2 || msgs[0].Role != "user" || msgs[1].Role != "assistant" || !strings.Contains(msgs[1].Content, "Design a feed") {
		t.Fatalf("chat: %+v", msgs)
	}
	ada.do("POST", url+"/chat", map[string]any{"message": "OFFTOPIC tell a joke"}, nil, 422)
	ada.do("POST", url+"/chat", map[string]any{"message": "  "}, nil, 422)

	var thread []design.Message
	ada.do("GET", url+"/messages", nil, &thread, 200)
	if len(thread) != 5 { // explanation, evaluation, evaluation, chat pair; the off-topic message is not stored
		t.Fatalf("thread: %d %+v", len(thread), thread)
	}

	bob.do("GET", url+"/messages", nil, nil, 404)
	bob.do("POST", url+"/evaluate", map[string]any{}, nil, 404)
	bob.do("POST", url+"/chat", map[string]any{"message": "hi"}, nil, 404)

	ada.do("DELETE", url, nil, nil, 204)
	var n int
	if err := e.pool.QueryRow(context.Background(), `select count(*) from design_messages where board_id = $1`, b.ID).Scan(&n); err != nil || n != 0 {
		t.Fatalf("messages left after delete: %d %v", n, err)
	}
}

func jsonUnmarshal(b []byte, v any) error { return json.Unmarshal(b, v) }
