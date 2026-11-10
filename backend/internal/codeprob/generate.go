package codeprob

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/chromedp/chromedp"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"pypr/backend/internal/openrouter"
)

// Spec says what a topic's problems look like.
type Spec struct {
	Topic    string
	Kind     string
	Language string
	Runner   string
}

// Specs lists the topics that have coding problems. Only JavaScript and HTML + CSS run in the browser;
// Node.js, TypeScript and DSA run on the server runner. DSA problems read stdin and print stdout and are solved in JavaScript or TypeScript.
var Specs = []Spec{
	{"node-js", KindMachine, "nodejs", RunnerServer},
	{"javascript", KindMachine, "javascript", RunnerBrowser},
	{"typescript", KindMachine, "typescript", RunnerServer},
	{"html-and-css", KindMachine, "html", RunnerBrowser},
	{"data-structures-and-algorithms", KindDSA, LangStdio, RunnerServer},
}

func SpecFor(topic, kind string) (Spec, bool) {
	for _, s := range Specs {
		if s.Topic == topic && (kind == "" || s.Kind == kind) {
			return s, true
		}
	}
	return Spec{}, false
}

// Raw is a problem as the model writes it.
type Raw struct {
	Title      string            `json:"title"`
	Difficulty string            `json:"difficulty"`
	Statement  string            `json:"statement"`
	Hint       string            `json:"hint"`
	Starter    map[string]string `json:"starter"`
	Solution   map[string]string `json:"solution"`
	Tests      []Test            `json:"tests"`
}

// Writer produces ideas and problems. A port: OpenRouter in production, fakes in tests.
type Writer interface {
	Ideas(ctx context.Context, topicName string, s Spec, n int, avoid []string) ([]string, error)
	Problem(ctx context.Context, topicName string, s Spec, idea, difficulty string) (Raw, error)
}

// Verifier runs a problem the way a learner would and returns it with its final tests (stdio problems get their
// expected outputs from the reference solution here).
type Verifier interface {
	Verify(ctx context.Context, s Spec, p Raw) (Raw, error)
}

// starterFiles are the files a learner edits. Stdio problems have none: the web app supplies a template per language.
var starterFiles = map[string][]string{
	"javascript": {"index.js"},
	"nodejs":     {"index.js"},
	"typescript": {"index.ts"},
	"html":       {"index.html", "style.css", "script.js"},
	LangStdio:    nil,
}

const stdioSolution = "solution.js"

var hashRe = regexp.MustCompile(`[^a-z0-9]+`)

func hashTitle(kind, title string) string {
	sum := sha256.Sum256([]byte(kind + ":" + strings.TrimSpace(hashRe.ReplaceAllString(strings.ToLower(title), " "))))
	return hex.EncodeToString(sum[:16])
}

// check validates the shape of a problem before it is run.
func check(s Spec, r Raw) error {
	names := starterFiles[s.Language]
	if strings.TrimSpace(r.Title) == "" || len(r.Title) > 120 || len(r.Statement) < 40 || len(r.Statement) > 8000 {
		return errors.New("title or statement missing or too long")
	}
	switch r.Difficulty {
	case "easy", "medium", "hard":
	default:
		return errors.New("bad difficulty")
	}
	for _, name := range names {
		if _, ok := r.Starter[name]; !ok {
			return fmt.Errorf("starter lacks %s", name)
		}
		if _, ok := r.Solution[name]; !ok {
			return fmt.Errorf("solution lacks %s", name)
		}
	}
	if s.Language == LangStdio {
		if len(r.Solution) != 1 || strings.TrimSpace(r.Solution[stdioSolution]) == "" {
			return fmt.Errorf("need a JavaScript reference solution in %s", stdioSolution)
		}
	} else if len(r.Starter) != len(names) || len(r.Solution) != len(names) {
		return errors.New("unexpected files")
	}
	if len(r.Tests) < 4 || len(r.Tests) > 12 {
		return errors.New("need 4 to 12 tests")
	}
	hidden := 0
	for _, t := range r.Tests {
		if strings.TrimSpace(t.Name) == "" {
			return errors.New("empty test")
		}
		if s.Language == LangStdio {
			if strings.TrimSpace(t.Input) == "" || (!t.Hidden && strings.TrimSpace(t.Expected) == "") {
				return errors.New("a test needs an input, and a visible one an expected output")
			}
		} else if strings.TrimSpace(t.Code) == "" {
			return errors.New("empty test")
		}
		if t.Hidden {
			hidden++
		}
	}
	if hidden == 0 || hidden == len(r.Tests) {
		return errors.New("need both visible and hidden tests")
	}
	return nil
}

type Options struct {
	Spec        Spec
	TopicName   string
	Target      int
	Concurrency int
	Log         func(msg string, args ...any)
}

// Generate grows a topic's problem set to Target. Only problems that failed as starters and passed as
// solutions in a real browser run are stored. It can be stopped and run again.
func Generate(ctx context.Context, pool *pgxpool.Pool, w Writer, v Verifier, o Options) (int, error) {
	s := o.Spec
	have := func() ([]string, error) {
		rows, err := pool.Query(ctx, `select title from code_problems where topic_key = $1 and kind = $2`, s.Topic, s.Kind)
		if err != nil {
			return nil, err
		}
		return pgx.CollectRows(rows, pgx.RowTo[string])
	}
	titles, err := have()
	if err != nil {
		return 0, err
	}
	var (
		added  atomic.Int64
		failed atomic.Int64
		mu     sync.Mutex
		seen   = map[string]bool{}
	)
	for _, t := range titles {
		seen[hashTitle(s.Kind, t)] = true
	}
	total := len(titles)
	difficulties := []string{"easy", "medium", "medium", "hard"}

	for total < o.Target && ctx.Err() == nil && failed.Load() < 10 {
		ideas, err := w.Ideas(ctx, o.TopicName, s, 12, titles)
		if err != nil {
			failed.Add(1)
			o.Log("ideas failed", "err", err)
			continue
		}
		var wg sync.WaitGroup
		sem := make(chan struct{}, max(1, o.Concurrency))
		for i, idea := range ideas {
			mu.Lock()
			if total >= o.Target || seen[hashTitle(s.Kind, idea)] {
				mu.Unlock()
				continue
			}
			mu.Unlock()
			wg.Add(1)
			sem <- struct{}{}
			go func() {
				defer wg.Done()
				defer func() { <-sem }()
				for attempt := 0; attempt < 2; attempt++ {
					r, err := w.Problem(ctx, o.TopicName, s, idea, difficulties[i%len(difficulties)])
					if err == nil {
						err = check(s, r)
					}
					if err == nil {
						r, err = v.Verify(ctx, s, r)
					}
					if err != nil {
						o.Log("discarded", "idea", idea, "attempt", attempt+1, "why", err.Error())
						continue
					}
					h := hashTitle(s.Kind, r.Title)
					mu.Lock()
					dup := seen[h]
					if !dup {
						seen[h] = true
					}
					mu.Unlock()
					if dup {
						return
					}
					if err := insert(ctx, pool, s, r, h); err != nil {
						o.Log("insert failed", "err", err)
						failed.Add(1)
						return
					}
					mu.Lock()
					total++
					titles = append(titles, r.Title)
					mu.Unlock()
					added.Add(1)
					failed.Store(0)
					o.Log("added", "title", r.Title, "difficulty", r.Difficulty, "total", total, "target", o.Target)
					return
				}
			}()
		}
		wg.Wait()
	}
	if failed.Load() >= 10 {
		return int(added.Load()), errors.New("stopped after repeated failures")
	}
	return int(added.Load()), ctx.Err()
}

func insert(ctx context.Context, pool *pgxpool.Pool, s Spec, r Raw, hash string) error {
	if r.Starter == nil {
		r.Starter = map[string]string{}
	}
	starter, _ := json.Marshal(r.Starter)
	solution, _ := json.Marshal(r.Solution)
	tests, _ := json.Marshal(r.Tests)
	_, err := pool.Exec(ctx,
		`insert into code_problems (topic_key, kind, language, runner, title, difficulty, statement, starter, tests, solution, hint, hash)
		 values ($1, $2, $3, $12, $4, $5, $6, $7, $8, $9, $10, $11) on conflict (topic_key, kind, hash) do nothing`,
		s.Topic, s.Kind, s.Language, strings.TrimSpace(r.Title), r.Difficulty, r.Statement, starter, tests, solution, r.Hint, hash, s.Runner)
	return err
}

// ---- Verification in headless Chrome

// Chrome verifies problems by loading the web app's /code-verify page, which uses the same runner as learners.
type Chrome struct {
	appURL string
	ctx    context.Context
	stop   func()
	mu     sync.Mutex
}

// NewChrome starts headless Chrome. CHROME_PATH selects the binary when it isn't on the usual paths.
func NewChrome(ctx context.Context, appURL string, noSandbox bool) (*Chrome, error) {
	opts := append(chromedp.DefaultExecAllocatorOptions[:], chromedp.Flag("hide-scrollbars", true))
	if path := os.Getenv("CHROME_PATH"); path != "" {
		opts = append(opts, chromedp.ExecPath(path))
	}
	if noSandbox {
		opts = append(opts, chromedp.NoSandbox)
	}
	alloc, cancelAlloc := chromedp.NewExecAllocator(ctx, opts...)
	bctx, cancelCtx := chromedp.NewContext(alloc)
	if err := chromedp.Do(bctx); err != nil {
		cancelCtx()
		cancelAlloc()
		return nil, fmt.Errorf("start chrome: %w", err)
	}
	return &Chrome{appURL: strings.TrimRight(appURL, "/"), ctx: bctx, stop: func() { cancelCtx(); cancelAlloc() }}, nil
}

func (c *Chrome) Close() { c.stop() }

type runResult struct {
	Logs  []struct{ Level, Text string } `json:"logs"`
	Tests []struct {
		Name  string `json:"name"`
		Ok    bool   `json:"ok"`
		Error string `json:"error"`
	} `json:"tests"`
	Error string `json:"error"`
}

type verifyOutput struct {
	Starter  runResult   `json:"starter"`
	Solution []runResult `json:"solution"`
}

func (c *Chrome) Verify(ctx context.Context, s Spec, p Raw) (Raw, error) {
	return p, c.verify(ctx, s.Language, p)
}

func (c *Chrome) verify(ctx context.Context, language string, p Raw) error {
	tctx, cancel := chromedp.NewContext(c.ctx)
	defer cancel()
	tctx, cancelT := context.WithTimeout(tctx, 90*time.Second)
	defer cancelT()

	input, _ := json.Marshal(map[string]any{"language": language, "starter": p.Starter, "solution": p.Solution, "tests": p.Tests})
	if err := chromedp.Do(tctx, chromedp.Navigate(c.appURL+"/code-verify")); err != nil {
		return fmt.Errorf("open verifier: %w", err)
	}
	if _, err := chromedp.Run(tctx, chromedp.Poll[bool](`window.__verifyReady === true`, chromedp.WithPollingTimeout(30*time.Second))); err != nil {
		return fmt.Errorf("verifier page not ready (is the web app running at %s?): %w", c.appURL, err)
	}
	out, err := chromedp.Run(tctx, chromedp.Evaluate[verifyOutput](`window.__verify(`+string(input)+`)`, chromedp.EvalAwaitPromise))
	if err != nil {
		return fmt.Errorf("run in browser: %w", err)
	}
	if out.Starter.Error != "" && !strings.HasPrefix(out.Starter.Error, "Timed out") {
		return fmt.Errorf("the starter crashes instead of failing tests: %s", out.Starter.Error)
	}
	allPass := true
	for _, t := range out.Starter.Tests {
		allPass = allPass && t.Ok
	}
	if allPass {
		return errors.New("the starter already passes every test")
	}
	for i, r := range out.Solution {
		if r.Error != "" {
			return fmt.Errorf("solution run %d: %s", i+1, r.Error)
		}
		for _, t := range r.Tests {
			if !t.Ok {
				return fmt.Errorf("solution run %d fails %q: %s", i+1, t.Name, t.Error)
			}
		}
		if len(r.Tests) != len(p.Tests) {
			return errors.New("solution run reported the wrong number of tests")
		}
	}
	return nil
}

// ---- AI writer

type OpenRouter struct{ Client *openrouter.Client }

func (o OpenRouter) Ideas(ctx context.Context, topicName string, s Spec, n int, avoid []string) ([]string, error) {
	var out struct {
		Ideas []string `json:"ideas"`
	}
	data, _ := json.Marshal(map[string]any{"topic": topicName, "kind": s.Kind, "language": s.Language, "count": n, "alreadyHave": avoid})
	system := `You plan coding practice problems for software engineering interviews. Reply with one JSON object only: {"ideas":["..."]}.
Each idea is a short title for one distinct problem (under 80 characters). Titles in "alreadyHave" are taken: do not repeat or reword them.`
	if s.Kind == KindMachine {
		system += `
These are MACHINE CODING problems: the learner writes a small piece of working code in the given language that makes something work (for example a debounce function, an LRU cache class, a rate limiter, an event bus, a retry helper, a promise pool, a CSS layout, an accessible accordion). They are NOT algorithm puzzles. Mix easy, medium and hard. Everything must be doable in one small file in a browser.`
	} else {
		system += `
These are DSA problems (arrays, strings, hashing, two pointers, stack/queue, linked lists, trees, graphs, recursion, sorting, binary search, dynamic programming, heaps, greedy, intervals). Interview style. Each is a complete program that reads input from stdin and prints the answer to stdout, so it can be solved in any language. Mix easy, medium and hard.`
	}
	if s.Language == "nodejs" {
		system += ` Real Node.js 22 on a server. Allowed modules only: events, util, path, assert, timers/promises, stream, buffer, crypto. No fs, http, child_process, network or files.`
	}
	if s.Language == "html" {
		system += ` Each problem is HTML + CSS (small JavaScript only when needed), checkable by looking at the DOM and computed styles.`
	}
	err := o.Client.ChatJSON(ctx, openrouter.Request{
		System: system,
		User:   []map[string]any{{"type": "text", "text": "List the ideas."}, openrouter.TextPart("request", string(data), 12000)},
	}, &out)
	return out.Ideas, err
}

func (o OpenRouter) Problem(ctx context.Context, topicName string, s Spec, idea, difficulty string) (Raw, error) {
	var out Raw
	data, _ := json.Marshal(map[string]any{"topic": topicName, "language": s.Language, "kind": s.Kind, "idea": idea, "difficulty": difficulty, "files": starterFiles[s.Language]})
	err := o.Client.ChatJSON(ctx, openrouter.Request{System: problemPrompt(s), User: []map[string]any{{"type": "text", "text": "Write the problem."}, openrouter.TextPart("request", string(data), 4000)}}, &out)
	return out, err
}

func problemPrompt(s Spec) string {
	if s.Language == LangStdio {
		return `You write one DSA practice problem for a coding playground. The learner writes a complete program in any language that reads stdin and prints to stdout. Reply with one JSON object only:
{"title":"","difficulty":"easy|medium|hard","statement":"","hint":"","solution":{"solution.js":"<complete Node.js reference program>"},"tests":[{"name":"","input":"","expected":"","hidden":false}]}

Statement: Markdown. Describe the task, then "### Input" (exact format, line by line), "### Output" (exact format), "### Constraints" (sizes small enough that a simple correct solution runs well under 1 second), and "### Examples" with 2 examples shown as fenced blocks for input and output. The answer must be unique and deterministic: if several answers could be right, add a rule that picks one (for example the smallest index first). Print results with plain print: no extra text, no trailing spaces.
The reference solution is a complete Node.js 22 program: it reads all of stdin with require("fs").readFileSync(0, "utf8"), prints with console.log, is correct and efficient, and uses no packages.
Tests: 6 to 10. The first 2 match the statement's examples ("hidden": false, with "expected" copied exactly from the statement). The rest are hidden ("hidden": true, "expected": "" because it is computed by running your solution): cover the smallest input, repeated values, negatives or zero if allowed, and a larger input within the constraints. "input" is the complete stdin text, ending with a newline. Test names are short.`
	}
	common := `You write one coding practice problem that runs in a playground and is checked by automatic tests. Reply with one JSON object only:
{"title":"","difficulty":"easy|medium|hard","statement":"","hint":"","starter":{"<file>":"<content>"},"solution":{"<file>":"<content>"},"tests":[{"name":"","code":"","hidden":false}]}

Statement: Markdown (short paragraphs, "-" lists, backticked code, fenced code blocks). Say exactly what to build, its signature or API, the rules, and 2 small examples with expected results. No headings above ###.
"starter" has the files named in the request, with the signature or skeleton and a TODO, so that it compiles but fails the tests. "solution" is a complete correct solution in the same files.
Tests: 5 to 8. The first 2 or 3 are visible examples ("hidden": false) that match the statement; the rest are hidden edge cases ("hidden": true). Every test must be deterministic and finish within 1 second: no randomness, no real clock, no network, no long timers (use at most 50 ms delays).
The statement and the tests must agree exactly. Test names are short.`
	switch s.Language {
	case "html":
		return common + `
Files: index.html (the markup inside <body> only: no <html>, <head> or <body> tags), style.css, script.js (may stay empty).
Test "code" is the BODY of an async function with these in scope: assert(cond, message), assert.equal(a, b), assert.strictEqual(a, b), $(selector), $$(selector), css(elementOrSelector, property) which returns the computed style value. Check structure with the DOM and appearance with computed styles (for example display, flex-direction, position, color as "rgb(r, g, b)", width in px for fixed sizes). Avoid checks that depend on viewport size, fonts or scrolling. The page is rendered in a sandboxed iframe about 600px wide.`
	case "typescript":
		return common + `
File: index.ts, run by Node.js 22 which strips the types and does not type-check, so tests must pass on runtime behavior. Use only erasable TypeScript: types, interfaces, generics and annotations are fine; no enums, namespaces, parameter properties (constructor(private x)) or import/export. Define everything at top level. Test "code" is the BODY of an async function in the same scope as the learner's code (top-level names are visible); "assert" is a Node assert object (assert.strictEqual, assert.deepStrictEqual, assert.throws, assert.rejects, assert.ok). The starter must be valid TypeScript that fails the tests (for example return a placeholder of the right type).`
	case "nodejs":
		return common + `
File: index.js, real Node.js 22 on a server (CommonJS). Define everything at top level; use require() only for events, util, path, assert, timers/promises, stream, buffer, crypto (for example const EventEmitter = require("events")). No fs, http, child_process, network or process.exit. Test "code" is the BODY of an async function in the same scope as the learner's code; "assert" is a Node assert object (assert.strictEqual, assert.deepStrictEqual, assert.throws, assert.rejects, assert.ok).`
	default:
		return common + `
File: index.js. Define everything at top level, with no export or import statements. Test "code" is the BODY of an async function in the same scope as the learner's code (top-level names are visible); use assert.strictEqual, assert.deepStrictEqual, assert.throws, assert.rejects, assert.ok (assert is a global).`
	}
}
