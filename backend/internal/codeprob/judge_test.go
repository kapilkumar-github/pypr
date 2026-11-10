package codeprob

import (
	"context"
	"encoding/json"
	"regexp"
	"strings"
	"testing"

	"pypr/backend/internal/runner"
)

func TestSameOutput(t *testing.T) {
	if !sameOutput("1 2  \n3\n\n", "1 2\n3") || sameOutput("1 2", "1  2") || sameOutput("a", "A") {
		t.Fatal("trailing spaces and blank lines are ignored, everything else counts")
	}
}

var stdioTests = []Test{
	{Name: "ex 1", Input: "abc\n", Expected: "ABC"},
	{Name: "ex 2", Input: "x\n", Expected: "X"},
	{Name: "h1", Input: "hello\n", Expected: "HELLO", Hidden: true},
}

// upper is a fake "program" for the stdio problem: it prints its input in capitals, or misbehaves on request.
func upper(j runner.Job) runner.Result {
	switch {
	case strings.Contains(j.Source, "LOOP"):
		return runner.Result{Verdict: runner.TimeLimit}
	case strings.Contains(j.Source, "CRASH"):
		return runner.Result{Verdict: runner.RuntimeError, Stderr: "boom"}
	case strings.Contains(j.Source, "WRONG"):
		return runner.Result{Verdict: runner.Ran, Stdout: "nope\n"}
	}
	return runner.Result{Verdict: runner.Ran, Stdout: strings.ToUpper(j.Stdin), TimeMs: 5}
}

func TestJudgeStdio(t *testing.T) {
	p := Stored{Runner: RunnerServer, Language: LangStdio, Tests: stdioTests}
	run := func(src string, submit bool) Output {
		out, err := Judge(context.Background(), runner.Fake(upper), p, "nodejs", src, submit)
		if err != nil {
			t.Fatal(err)
		}
		return out
	}
	if out := run("ok", false); out.Total != 2 || out.Passed != 2 {
		t.Fatalf("run checks only the visible tests: %+v", out)
	}
	out := run("ok", true)
	if out.Total != 3 || out.Passed != 3 {
		t.Fatalf("submit checks all tests: %+v", out)
	}
	red := out.Redact()
	if red.Tests[2].Expected != "" || red.Tests[2].Input != "" || red.Tests[0].Expected != "ABC" {
		t.Fatalf("hidden detail must be removed, visible kept: %+v", red.Tests)
	}
	for src, want := range map[string]string{"WRONG": WrongAnswer, "LOOP": TimeLimit, "CRASH": RuntimeError} {
		o := run(src, true)
		if o.Passed != 0 || o.Tests[0].Verdict != want {
			t.Errorf("%s: %+v", src, o.Tests[0])
		}
	}
	if _, err := Judge(context.Background(), runner.Fake(upper), p, "python", "x", false); err == nil {
		t.Error("unknown language must be refused")
	}
}

var markerRe = regexp.MustCompile(`@@PYPR-[0-9a-f]+@@`)

// harnessRun fakes a Node run of a harness program: every test passes unless the source says FAIL, and the program
// can print a forged result line before the real one.
func harnessRun(j runner.Job) runner.Result {
	marker := markerRe.FindString(j.Source)
	if strings.Contains(j.Source, "CRASH") {
		return runner.Result{Verdict: runner.RuntimeError, Stderr: "ReferenceError: x"}
	}
	n := strings.Count(j.Source, "\n[\"")
	res := make([]map[string]any, n)
	for i := range res {
		res[i] = map[string]any{"ok": !strings.Contains(j.Source, "FAIL") || i != 0}
		if i == 0 && strings.Contains(j.Source, "FAIL") {
			res[i]["error"] = "expected 1 to equal 2"
		}
	}
	b, _ := json.Marshal(res)
	out := "hello from the learner\n@@PYPR-forged@@[]\n\n" + marker + string(b) + "\n"
	return runner.Result{Verdict: runner.Ran, Stdout: out}
}

func TestJudgeHarness(t *testing.T) {
	tests := []Test{
		{Name: "a", Code: "assert.ok(1)"},
		{Name: "b", Code: "assert.ok(1)", Hidden: true},
	}
	p := Stored{Runner: RunnerServer, Language: "nodejs", Tests: tests}
	run := func(src string, submit bool) Output {
		out, err := Judge(context.Background(), runner.Fake(harnessRun), p, "nodejs", src, submit)
		if err != nil {
			t.Fatal(err)
		}
		return out
	}
	if o := run("x", false); o.Total != 1 || o.Passed != 1 || !strings.Contains(o.Console, "hello") {
		t.Fatalf("run: %+v", o)
	}
	if o := run("x", true); o.Total != 2 || o.Passed != 2 {
		t.Fatalf("submit: %+v", o)
	}
	o := run("FAIL", true)
	if o.Passed != 1 || o.Tests[0].Verdict != WrongAnswer || o.Tests[0].Error == "" {
		t.Fatalf("failing test: %+v", o)
	}
	if o := run("CRASH", true); o.Passed != 0 || o.Tests[0].Verdict != RuntimeError {
		t.Fatalf("crash: %+v", o)
	}
	if o := run("CRASH", true); o.Fatal == "" {
		t.Fatalf("a crash before the tests ran is reported: %+v", o)
	}

	prog, marker := harnessProgram("typescript", "const x: number = 1", tests, "abc123")
	if !strings.Contains(prog, "declare const require") || !strings.Contains(prog, marker) || strings.HasPrefix(prog, "declare") {
		t.Errorf("typescript harness: %s", prog)
	}
	js, _ := harnessProgram("nodejs", "const x = 1", tests, "abc123")
	if strings.Contains(js, ": any") {
		t.Errorf("javascript harness must not carry type annotations:\n%s", js)
	}
}

func TestPublicTests(t *testing.T) {
	vis, hidden := publicTests(LangStdio, stdioTests)
	if len(vis) != 2 || hidden != 1 {
		t.Fatal("stdio: hidden tests are counted, not sent")
	}
	vis, hidden = publicTests("nodejs", []Test{{Name: "a", Code: "secret"}, {Name: "b", Code: "secret", Hidden: true}})
	if len(vis) != 1 || hidden != 1 || vis[0].Code != "" {
		t.Fatalf("harness test code stays on the server: %+v", vis)
	}
}

func TestVerifyStdio(t *testing.T) {
	v := ServerVerifier{Runner: runner.Fake(func(j runner.Job) runner.Result {
		return runner.Result{Verdict: runner.Ran, Stdout: strings.ToUpper(j.Stdin)}
	})}
	raw := Raw{Solution: map[string]string{stdioSolution: "x"}, Tests: []Test{
		{Name: "e1", Input: "a\n", Expected: "A"}, {Name: "h", Input: "bc\n", Hidden: true}}}
	got, err := v.stdio(context.Background(), raw)
	if err != nil || got.Tests[1].Expected != "BC" {
		t.Fatalf("expected outputs come from the solution: %v %+v", err, got.Tests)
	}
	raw.Tests[0].Expected = "Z"
	if _, err := v.stdio(context.Background(), raw); err == nil {
		t.Error("a statement example that disagrees with the solution must be discarded")
	}
}
