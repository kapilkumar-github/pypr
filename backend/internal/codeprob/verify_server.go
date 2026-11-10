package codeprob

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"pypr/backend/internal/runner"
)

// ServerVerifier checks server problems by running them on the same runner learners use.
type ServerVerifier struct{ Runner runner.Runner }

func (v ServerVerifier) Verify(ctx context.Context, s Spec, p Raw) (Raw, error) {
	if s.Language == LangStdio {
		return v.stdio(ctx, p)
	}
	return p, v.harness(ctx, s, p)
}

// harness: the starter must fail at least one test without crashing; the solution must pass every test, twice.
func (v ServerVerifier) harness(ctx context.Context, s Spec, p Raw) error {
	name := starterFiles[s.Language][0]
	stored := Stored{Runner: RunnerServer, Language: s.Language, Tests: p.Tests}
	start, err := Judge(ctx, v.Runner, stored, s.Language, p.Starter[name], true)
	if err != nil {
		return err
	}
	failed := 0
	for _, t := range start.Tests {
		switch t.Verdict {
		case Accepted:
		case WrongAnswer:
			failed++
		default:
			return fmt.Errorf("the starter crashes instead of failing tests (%s): %s", t.Verdict, firstLine(t.Error))
		}
	}
	if failed == 0 {
		return errors.New("the starter already passes every test")
	}
	for run := 1; run <= 2; run++ {
		out, err := Judge(ctx, v.Runner, stored, s.Language, p.Solution[name], true)
		if err != nil {
			return err
		}
		for _, t := range out.Tests {
			if t.Verdict != Accepted {
				return fmt.Errorf("solution run %d fails %q (%s): %s", run, t.Name, t.Verdict, firstLine(t.Error))
			}
		}
	}
	return nil
}

// stdio: the Python reference solution produces the expected outputs. Two runs must agree, and the outputs the
// statement shows for the visible tests must match what the solution prints.
func (v ServerVerifier) stdio(ctx context.Context, p Raw) (Raw, error) {
	jobs := make([]runner.Job, len(p.Tests))
	for i, t := range p.Tests {
		jobs[i] = runner.Job{Language: "nodejs", Source: p.Solution[stdioSolution], Stdin: t.Input}
	}
	var first []runner.Result
	for run := 1; run <= 2; run++ {
		res, err := v.Runner.Run(ctx, jobs)
		if err != nil {
			return p, err
		}
		for i, x := range res {
			switch {
			case x.Verdict != runner.Ran:
				return p, fmt.Errorf("solution run %d on test %q: %s %s", run, p.Tests[i].Name, x.Verdict, firstLine(x.Stderr))
			case strings.TrimSpace(x.Stdout) == "":
				return p, fmt.Errorf("solution prints nothing for test %q", p.Tests[i].Name)
			case run == 2 && !sameOutput(x.Stdout, first[i].Stdout):
				return p, fmt.Errorf("solution output differs between runs for test %q", p.Tests[i].Name)
			}
		}
		if run == 1 {
			first = res
		}
	}
	tests := make([]Test, len(p.Tests))
	for i, t := range p.Tests {
		got := strings.TrimRight(first[i].Stdout, "\n ")
		if !t.Hidden && !sameOutput(got, t.Expected) {
			return p, fmt.Errorf("the statement's example %q says %q but the solution prints %q", t.Name, clipText(t.Expected), clipText(got))
		}
		t.Expected = got
		tests[i] = t
	}
	p.Tests = tests
	return p, nil
}

// Router sends a problem to the verifier for its runner.
type Router struct {
	Browser Verifier
	Server  Verifier
}

func (r Router) Verify(ctx context.Context, s Spec, p Raw) (Raw, error) {
	v := r.Browser
	if s.Runner == RunnerServer {
		v = r.Server
	}
	if v == nil {
		return p, fmt.Errorf("no verifier for runner %s", s.Runner)
	}
	return v.Verify(ctx, s, p)
}

func firstLine(s string) string {
	s = strings.TrimSpace(s)
	line, _, _ := strings.Cut(s, "\n")
	return clipText(line)
}

func clipText(s string) string {
	if len(s) > 120 {
		return s[:120] + "…"
	}
	return s
}
