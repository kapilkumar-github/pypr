package machine

import (
	"context"
	"slices"
	"strings"

	"pypr/backend/internal/codeprob"
	"pypr/backend/internal/runner"
)

// TestView is a visible test (name only: the test code never leaves the server) or a hidden one (counted, not named).
type TestView struct {
	Name string `json:"name"`
}

// StageView is a stage as a learner sees it. Locked stages show only their title.
type StageView struct {
	N            int        `json:"n"`
	Title        string     `json:"title"`
	Locked       bool       `json:"locked"`
	Requirements string     `json:"requirements,omitempty"`
	Tests        []TestView `json:"tests"`
	HiddenCount  int        `json:"hiddenCount"`
	HintCount    int        `json:"hintCount"`
}

// ProblemView is a problem as a learner sees it in a session. It never carries solutions, test code or hints.
type ProblemView struct {
	ID           string      `json:"id"`
	Slug         string      `json:"slug"`
	Category     string      `json:"category"`
	Title        string      `json:"title"`
	Difficulty   string      `json:"difficulty"`
	Statement    string      `json:"statement"`
	Requirements []string    `json:"requirements"`
	Stages       []StageView `json:"stages"`
	Evaluation   []Criterion `json:"evaluation"`
	// Followups appear once the session is over (or in review).
	Followups []string `json:"followups"`
	Prelude   string   `json:"prelude"`
	Starter   string   `json:"starter"`
	Minutes   int      `json:"minutes"`
}

// SessionView is what the playground opens with.
type SessionView struct {
	Session Session     `json:"session"`
	Problem ProblemView `json:"problem"`
	Source  string      `json:"source"`
	// Hints tells whether this session may use hints.
	Hints bool `json:"hints"`
}

// unlocked is how many stages a session shows: review shows all; otherwise the cleared ones and the next.
func unlocked(s Session, p Problem) int {
	if s.Mode == ModeReview {
		return len(p.Stages)
	}
	return min(s.StageReached+1, len(p.Stages))
}

func view(s Session, p Problem, source string) SessionView {
	n := unlocked(s, p)
	pv := ProblemView{
		ID: p.ID, Slug: p.Slug, Category: p.Category, Title: p.Title, Difficulty: p.Difficulty, Statement: p.Statement,
		Requirements: p.Requirements, Evaluation: p.Evaluation, Followups: []string{}, Prelude: p.Prelude, Starter: p.Starter["index.js"], Minutes: p.DurationMinutes,
		Stages: make([]StageView, len(p.Stages)),
	}
	if s.FinishedAt != nil || s.Mode == ModeReview {
		pv.Followups = p.Followups
	}
	for i, st := range p.Stages {
		sv := StageView{N: st.N, Title: st.Title, Locked: i >= n, Tests: []TestView{}}
		if !sv.Locked {
			sv.Requirements = st.Requirements
			for _, t := range st.Tests {
				if t.Hidden {
					sv.HiddenCount++
				} else {
					sv.Tests = append(sv.Tests, TestView{Name: t.Name})
				}
			}
			if s.Mode == ModePractice {
				sv.HintCount = len(st.Hints)
			}
		}
		pv.Stages[i] = sv
	}
	return SessionView{Session: s, Problem: pv, Source: source, Hints: s.Mode == ModePractice}
}

// StageTest is one test result. Hidden tests carry a verdict only.
type StageTest struct {
	Stage   int    `json:"stage"`
	Name    string `json:"name"`
	Hidden  bool   `json:"hidden"`
	Verdict string `json:"verdict"`
	TimeMs  int    `json:"timeMs"`
	Error   string `json:"error,omitempty"`
}

type JudgeResult struct {
	Tests        []StageTest `json:"tests"`
	Passed       int         `json:"passed"`
	Total        int         `json:"total"`
	Fatal        string      `json:"fatal,omitempty"`
	Console      string      `json:"console,omitempty"`
	Stage        int         `json:"stage"`
	Cleared      bool        `json:"cleared"`
	StageReached int         `json:"stageReached"`
}

// judge runs the learner's code against the tests of stages 1..stage, so a later stage cannot break an earlier one.
// Run (submit false) uses the visible tests only; Submit uses every test.
func judge(ctx context.Context, r runner.Runner, p Problem, stage int, source string, submit bool) (JudgeResult, error) {
	var tests []codeprob.Test
	var owner []int
	for _, st := range p.Stages {
		if st.N > stage {
			break
		}
		for _, t := range st.Tests {
			if submit || !t.Hidden {
				tests = append(tests, t)
				owner = append(owner, st.N)
			}
		}
	}
	program := source
	if p.Prelude != "" {
		program = p.Prelude + "\n" + source
	}
	out, err := codeprob.Judge(ctx, r, codeprob.Stored{Runner: codeprob.RunnerServer, Language: "nodejs", Tests: tests}, "nodejs", program, true)
	if err != nil {
		return JudgeResult{}, err
	}
	out = out.Redact()
	res := JudgeResult{Passed: out.Passed, Total: out.Total, Fatal: out.Fatal, Console: out.Console, Stage: stage, Tests: []StageTest{}}
	for i, t := range out.Tests {
		st := StageTest{Stage: owner[i], Name: t.Name, Hidden: t.Hidden, Verdict: t.Verdict, TimeMs: t.TimeMs, Error: t.Error}
		if t.Hidden {
			st.Name = ""
		}
		res.Tests = append(res.Tests, st)
	}
	// Only a full pass of every test counts as clearing the stage.
	res.Cleared = submit && out.Total > 0 && out.Passed == out.Total && out.Fatal == ""
	return res, nil
}

func stageOf(p Problem, n int) (Stage, bool) {
	i := slices.IndexFunc(p.Stages, func(s Stage) bool { return s.N == n })
	if i < 0 {
		return Stage{}, false
	}
	return p.Stages[i], true
}

func trim(s string) string { return strings.TrimSpace(s) }
