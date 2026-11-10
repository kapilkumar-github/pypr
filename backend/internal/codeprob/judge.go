package codeprob

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"

	"pypr/backend/internal/runner"
)

// Verdicts shown to a learner for one test.
const (
	Accepted     = "accepted"
	WrongAnswer  = "wrong_answer"
	RuntimeError = "runtime_error"
	TimeLimit    = "time_limit"
)

// TestResult is the outcome of one test. Input, Expected, Stdout and Error are for visible tests only (see redact).
type TestResult struct {
	Name     string `json:"name"`
	Hidden   bool   `json:"hidden"`
	Verdict  string `json:"verdict"`
	TimeMs   int    `json:"timeMs"`
	Input    string `json:"input,omitempty"`
	Expected string `json:"expected,omitempty"`
	Stdout   string `json:"stdout,omitempty"`
	Error    string `json:"error,omitempty"`
}

type Output struct {
	Tests  []TestResult `json:"tests"`
	Passed int          `json:"passed"`
	Total  int          `json:"total"`
	// Fatal is why the program produced no test results (a syntax error, a crash while loading).
	Fatal string `json:"fatal,omitempty"`
	// Console is what the program printed (harness problems).
	Console string `json:"console,omitempty"`
}

// Stored is the part of a problem a judge run needs.
type Stored struct {
	Runner   string
	Language string
	Tests    []Test
}

func languagesFor(problemLanguage string) []string {
	if problemLanguage == LangStdio {
		return runner.Languages
	}
	return []string{problemLanguage}
}

// publicTests hides what a learner must not see: for stdio problems the hidden tests, for harness problems the test code.
func publicTests(language string, tests []Test) (visible []Test, hidden int) {
	for _, t := range tests {
		if t.Hidden {
			hidden++
			continue
		}
		if language != LangStdio {
			t.Code = ""
		}
		visible = append(visible, t)
	}
	if visible == nil {
		visible = []Test{}
	}
	return visible, hidden
}

// redact removes the details of hidden tests from a result.
func (o Output) Redact() Output {
	tests := make([]TestResult, len(o.Tests))
	for i, t := range o.Tests {
		if t.Hidden {
			t.Input, t.Expected, t.Stdout, t.Error = "", "", "", ""
		}
		tests[i] = t
	}
	o.Tests = tests
	return o
}

// Judge runs a program against a problem's tests. Run mode (submit false) checks the visible tests only.
// The result has full detail for every test it ran: callers redact before sending it to a learner.
func Judge(ctx context.Context, r runner.Runner, p Stored, language, source string, submit bool) (Output, error) {
	if !slices.Contains(languagesFor(p.Language), language) {
		return Output{}, errors.New("unsupported language")
	}
	var tests []Test
	for _, t := range p.Tests {
		if submit || !t.Hidden {
			tests = append(tests, t)
		}
	}
	if len(tests) == 0 {
		return Output{}, errors.New("problem has no tests")
	}
	if p.Language == LangStdio {
		return judgeStdio(ctx, r, tests, language, source)
	}
	return judgeHarness(ctx, r, tests, language, source)
}

func judgeStdio(ctx context.Context, r runner.Runner, tests []Test, language, source string) (Output, error) {
	jobs := make([]runner.Job, len(tests))
	for i, t := range tests {
		jobs[i] = runner.Job{Language: language, Source: source, Stdin: t.Input}
	}
	res, err := r.Run(ctx, jobs)
	if err != nil {
		return Output{}, err
	}
	out := Output{Total: len(tests)}
	for i, t := range tests {
		x := res[i]
		tr := TestResult{Name: t.Name, Hidden: t.Hidden, TimeMs: x.TimeMs, Input: t.Input, Expected: t.Expected, Stdout: x.Stdout}
		switch x.Verdict {
		case runner.TimeLimit:
			tr.Verdict = TimeLimit
		case runner.RuntimeError:
			tr.Verdict = RuntimeError
			tr.Error = x.Stderr
		default:
			if sameOutput(x.Stdout, t.Expected) {
				tr.Verdict = Accepted
				out.Passed++
			} else {
				tr.Verdict = WrongAnswer
				tr.Error = x.Stderr
			}
		}
		out.Tests = append(out.Tests, tr)
	}
	return out, nil
}

// sameOutput ignores trailing spaces on each line and blank lines at the end.
func sameOutput(a, b string) bool { return normalize(a) == normalize(b) }

func normalize(s string) string {
	lines := strings.Split(strings.ReplaceAll(s, "\r\n", "\n"), "\n")
	for i := range lines {
		lines[i] = strings.TrimRight(lines[i], " \t\r")
	}
	for len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}
	return strings.Join(lines, "\n")
}

// harnessProgram appends the tests to the learner's file. Tests are bodies of async functions in the file's own
// scope, so they see the learner's top-level names, exactly as in the browser runner. The result is one JSON line
// behind a marker that has a random part, so a stray console.log in the learner's code can't be mistaken for it.
func harnessProgram(language, source string, tests []Test, nonce string) (program, marker string) {
	marker = "@@PYPR-" + nonce + "@@"
	var b strings.Builder
	b.WriteString(source)
	b.WriteString("\n;\n")
	if language == "typescript" {
		b.WriteString("declare const require: any; declare const process: any;\n")
	}
	b.WriteString("(async () => {\nconst assert = require('assert');\nconst __tests: any[] = [\n")
	for _, t := range tests {
		name, _ := json.Marshal(t.Name)
		fmt.Fprintf(&b, "[%s, async () => {\n%s\n}],\n", name, t.Code)
	}
	b.WriteString("];\nconst __out: any[] = [];\n")
	b.WriteString(`for (const [name, fn] of __tests) {
  let timer: any;
  try {
    await Promise.race([fn(), new Promise((_, no) => { timer = setTimeout(() => no(new Error('Timed out after 2 seconds')), 2000); })]);
    __out.push({ ok: true });
  } catch (e) {
    __out.push({ ok: false, error: String((e && e.message) || e).slice(0, 400) });
  } finally { clearTimeout(timer); }
}
console.log('\n` + marker + `' + JSON.stringify(__out));
process.exit(0);
})();
`)
	p := b.String()
	if language == "nodejs" {
		// Plain JavaScript: drop the type annotations the shared text carries.
		p = strings.NewReplacer("const __tests: any[]", "const __tests", "const __out: any[]", "const __out", "let timer: any;", "let timer;").Replace(p)
	}
	return p, marker
}

func judgeHarness(ctx context.Context, r runner.Runner, tests []Test, language, source string) (Output, error) {
	nb := make([]byte, 12)
	_, _ = rand.Read(nb)
	program, marker := harnessProgram(language, source, tests, hex.EncodeToString(nb))
	res, err := r.Run(ctx, []runner.Job{{Language: language, Source: program}})
	if err != nil {
		return Output{}, err
	}
	x := res[0]
	out := Output{Total: len(tests)}
	stdout, outcomes := parseHarness(x.Stdout, marker)
	out.Console = strings.TrimSpace(stdout)
	if len(out.Console) > 4000 {
		out.Console = out.Console[:4000] + "\n…output cut"
	}
	failure := ""
	switch {
	case outcomes == nil && x.Verdict == runner.TimeLimit:
		failure = TimeLimit
		out.Fatal = "Time limit exceeded: is there an infinite loop?"
	case outcomes == nil:
		failure = RuntimeError
		out.Fatal = lastLines(x.Stderr, 8)
	case len(outcomes) != len(tests):
		failure = RuntimeError
		out.Fatal = "The program stopped before every test ran."
	}
	for i, t := range tests {
		tr := TestResult{Name: t.Name, Hidden: t.Hidden, TimeMs: x.TimeMs}
		switch {
		case failure != "":
			tr.Verdict = failure
			if failure == RuntimeError {
				tr.Error = lastLines(x.Stderr, 6)
			}
		case outcomes[i].Ok:
			tr.Verdict = Accepted
			out.Passed++
		default:
			tr.Verdict = WrongAnswer
			tr.Error = outcomes[i].Error
		}
		out.Tests = append(out.Tests, tr)
	}
	return out, nil
}

type outcome struct {
	Ok    bool   `json:"ok"`
	Error string `json:"error"`
}

// parseHarness splits the program's output into what the learner printed and the harness's result line.
func parseHarness(stdout, marker string) (printed string, outcomes []outcome) {
	i := strings.LastIndex(stdout, marker)
	if i < 0 {
		return stdout, nil
	}
	printed = stdout[:i]
	line, _, _ := strings.Cut(stdout[i+len(marker):], "\n")
	if err := json.Unmarshal([]byte(line), &outcomes); err != nil {
		return printed, nil
	}
	return printed, outcomes
}

func lastLines(s string, n int) string {
	lines := strings.Split(strings.TrimSpace(s), "\n")
	if len(lines) > n {
		lines = lines[len(lines)-n:]
	}
	return strings.Join(lines, "\n")
}
