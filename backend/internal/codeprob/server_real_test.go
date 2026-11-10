package codeprob

import (
	"context"
	"testing"
	"time"

	"pypr/backend/internal/runner"
)

// Needs Docker and the runner image (docker pull node:22-alpine); skipped otherwise.
func TestRealHarnessAndStdio(t *testing.T) {
	d := runner.NewDocker("")
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	if err := d.Ensure(ctx); err != nil {
		t.Skip(err)
	}
	v := ServerVerifier{Runner: d}

	counter := []Test{
		{Name: "counts", Code: `const c = new Counter(); c.inc(); c.inc(); assert.strictEqual(c.value, 2)`},
		{Name: "starts at zero", Code: `assert.strictEqual(new Counter().value, 0)`},
		{Name: "async", Code: `const c = new Counter(); await c.incLater(); assert.strictEqual(c.value, 1)`, Hidden: true},
	}
	js := Raw{
		Starter:  map[string]string{"index.js": "class Counter { constructor() { this.value = 0 } inc() {} incLater() { return Promise.resolve() } }"},
		Solution: map[string]string{"index.js": "class Counter { constructor() { this.value = 0 } inc() { this.value++ } async incLater() { await new Promise((r) => setTimeout(r, 10)); this.inc() } }"},
		Tests:    counter,
	}
	if _, err := v.Verify(ctx, Spec{"node-js", KindMachine, "nodejs", RunnerServer}, js); err != nil {
		t.Errorf("nodejs: %v", err)
	}
	ts := Raw{
		Starter:  map[string]string{"index.ts": "class Counter { value: number = 0; inc(): void {} incLater(): Promise<void> { return Promise.resolve() } }"},
		Solution: map[string]string{"index.ts": "class Counter { value: number = 0; inc(): void { this.value++ } async incLater(): Promise<void> { await new Promise<void>((r) => setTimeout(r, 10)); this.inc() } }"},
		Tests:    counter,
	}
	if _, err := v.Verify(ctx, Spec{"typescript", KindMachine, "typescript", RunnerServer}, ts); err != nil {
		t.Errorf("typescript: %v", err)
	}
	bad := js
	bad.Solution = map[string]string{"index.js": "class Counter { constructor() { this.value = 0 } inc() { while (true) {} } incLater() {} }"}
	if _, err := v.Verify(ctx, Spec{"node-js", KindMachine, "nodejs", RunnerServer}, bad); err == nil {
		t.Error("an infinite loop must fail verification")
	}
	syntax := js
	syntax.Solution = map[string]string{"index.js": "class Counter { ("}
	if _, err := v.Verify(ctx, Spec{"node-js", KindMachine, "nodejs", RunnerServer}, syntax); err == nil {
		t.Error("a syntax error must fail verification")
	}

	// One stdio problem: the reference solution makes the expected outputs, learners solve it in JavaScript or TypeScript.
	stdio := []Test{{Name: "e1", Input: "3\n1 2 3\n", Expected: "6"}, {Name: "h1", Input: "2\n-5 5\n", Hidden: true}, {Name: "h2", Input: "1\n7\n", Hidden: true}}
	raw := Raw{Solution: map[string]string{stdioSolution: "const [n, line] = require('fs').readFileSync(0, 'utf8').split('\\n'); console.log(line.split(' ').map(Number).reduce((a, b) => a + b, 0))"}, Tests: stdio}
	got, err := v.stdio(ctx, raw)
	if err != nil {
		t.Fatal(err)
	}
	if got.Tests[1].Expected != "0" || got.Tests[2].Expected != "7" {
		t.Fatalf("expected outputs: %+v", got.Tests)
	}
	programs := map[string]string{
		"nodejs":     raw.Solution[stdioSolution],
		"typescript": "const parts: string[] = require('fs').readFileSync(0, 'utf8').split('\\n'); console.log(parts[1].split(' ').map(Number).reduce((a: number, b: number) => a + b, 0));",
	}
	for lang, src := range programs {
		out, err := Judge(ctx, d, Stored{Runner: RunnerServer, Language: LangStdio, Tests: got.Tests}, lang, src, true)
		if err != nil {
			t.Errorf("%s: %v", lang, err)
			continue
		}
		if out.Passed != out.Total {
			t.Errorf("%s: %+v", lang, out)
		}
	}
}
