package machine

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"pypr/backend/internal/codeprob"
	"pypr/backend/internal/runner"
)

var testSeed = Seed{Slug: "rate-limiter-test", Category: "utility", Title: "Rate limiter", Difficulty: "medium", Minutes: 60, Redis: true, Stages: []string{"a", "b", "c"}}

func draft() Raw {
	var st []Stage
	stages, solutions := rateLimiter()
	_ = solutions
	if err := jsonUnmarshal(stages, &st); err != nil {
		panic(err)
	}
	// Two visible and two hidden tests per stage, as the generator requires.
	extra := func(n int) []codeprob.Test {
		return []codeprob.Test{
			{Name: "extra visible " + string(rune('0'+n)), Code: "assert.ok(true)"},
			{Name: "extra hidden " + string(rune('0'+n)), Code: "assert.ok(true)", Hidden: true},
			{Name: "extra hidden b" + string(rune('0'+n)), Code: "assert.ok(true)", Hidden: true},
		}
	}
	raw := Raw{
		Summary:      "Limit calls per key.",
		Statement:    strings.Repeat("Build a rate limiter with FakeRedis. ", 8),
		Requirements: []string{"one", "two", "three"},
		Evaluation:   []Criterion{{"Correctness", "d"}, {"Structure", "d"}, {"Concurrency", "d"}, {"Testability", "d"}},
		Followups:    []string{"Add cancellation", "Add metrics"},
		Starter:      "class RateLimiter { allow() { return true } }\nclass RedisRateLimiter { async allow() { return true } }",
	}
	sols := []string{stage1, stage2, stage3}
	for i, s := range st {
		raw.Stages = append(raw.Stages, RawStage{Title: s.Title, Requirements: strings.Repeat(s.Requirements+" ", 12), Hints: []string{"h1", "h2"}, Tests: append(s.Tests, extra(i+1)...), Solution: sols[i]})
	}
	return raw
}

func TestVerify(t *testing.T) {
	d := runner.NewDocker("")
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Minute)
	defer cancel()
	if err := d.Ensure(ctx); err != nil {
		t.Skip(err)
	}
	if _, err := Verify(ctx, d, testSeed, draft()); err != nil {
		t.Fatalf("a good draft: %v", err)
	}

	bad := func(name, want string, edit func(r *Raw)) {
		t.Helper()
		r := draft()
		edit(&r)
		_, err := Verify(ctx, d, testSeed, r)
		if err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("%s: want error containing %q, got %v", name, want, err)
		}
	}
	bad("stage adds nothing", "adds nothing", func(r *Raw) {
		r.Stages[1].Tests = r.Stages[0].Tests[:0:0]
		r.Stages[1].Tests = []codeprob.Test{{Name: "x1", Code: "assert.ok(true)"}, {Name: "x2", Code: "assert.ok(true)"}, {Name: "x3", Code: "assert.ok(true)", Hidden: true}, {Name: "x4", Code: "assert.ok(true)", Hidden: true}}
	})
	bad("starter already passes", "already passes", func(r *Raw) { r.Starter = stage3 })
	bad("starter crashes", "starter crashes", func(r *Raw) { r.Starter = "class RateLimiter {" })
	bad("wrong solution", "fails its own tests", func(r *Raw) { r.Stages[0].Solution = "class RateLimiter { allow() { return false } }" })
	bad("redis not described", "FakeRedis", func(r *Raw) { r.Statement = strings.Repeat("Build a limiter. ", 20) })
	bad("wrong stage count", "exactly 3 stages", func(r *Raw) { r.Stages = r.Stages[:2] })
	bad("too few hidden tests", "hidden", func(r *Raw) {
		for i := range r.Stages[0].Tests {
			r.Stages[0].Tests[i].Hidden = false
		}
	})
}

type fakeWriter struct {
	drafts, repairs int
	first           Raw
	fixed           Raw
	reasons         []string
}

func (f *fakeWriter) Draft(context.Context, Seed) (Raw, error) { f.drafts++; return f.first, nil }
func (f *fakeWriter) Repair(_ context.Context, _ Seed, _ Raw, problem string) (Raw, error) {
	f.repairs++
	f.reasons = append(f.reasons, problem)
	return f.fixed, nil
}

func TestGenerateRepairs(t *testing.T) {
	d := runner.NewDocker("")
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Minute)
	defer cancel()
	if err := d.Ensure(ctx); err != nil {
		t.Skip(err)
	}
	e := newEnv(t, d)
	broken := draft()
	broken.Stages[1].Solution = stage1 // stage 2's solution forgets the Redis limiter
	w := &fakeWriter{first: broken, fixed: draft()}
	seed := testSeed
	seed.Slug = "rate-limiter-repair"
	added, err := Generate(ctx, e.pool, w, d, seed, 2, func(string, ...any) {})
	if err != nil || !added {
		t.Fatalf("added=%v err=%v", added, err)
	}
	if w.repairs != 1 || !strings.Contains(w.reasons[0], "stage 2 solution fails its own tests") {
		t.Fatalf("the writer gets the reason: %+v", w)
	}
	var n int
	if err := e.pool.QueryRow(ctx, `select count(*) from mc_problems where slug = $1`, seed.Slug).Scan(&n); err != nil || n != 1 {
		t.Fatalf("stored: %d %v", n, err)
	}
	// Giving up after the allowed repairs.
	hopeless := &fakeWriter{first: broken, fixed: broken}
	seed.Slug = "rate-limiter-hopeless"
	if _, err := Generate(ctx, e.pool, hopeless, d, seed, 1, func(string, ...any) {}); err == nil || hopeless.repairs != 1 {
		t.Fatalf("should give up: repairs=%d err=%v", hopeless.repairs, err)
	}
	_ = errors.New
}
