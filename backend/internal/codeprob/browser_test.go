package codeprob

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"
)

// Runs problems in a real browser through the web app's /code-verify page:
//
//	CODE_VERIFY_URL=http://localhost:3000 CHROME_PATH=/path/to/chrome go test ./internal/codeprob -run Browser -v
func TestBrowserSandbox(t *testing.T) {
	url := os.Getenv("CODE_VERIFY_URL")
	if url == "" {
		t.Skip("CODE_VERIFY_URL not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	c, err := NewChrome(ctx, url, os.Getenv("CHROME_NO_SANDBOX") == "true")
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()

	js := func(starter, solution string, tests ...Test) Raw {
		return Raw{Starter: map[string]string{"index.js": starter}, Solution: map[string]string{"index.js": solution}, Tests: tests}
	}
	ok := func(name string, language string, r Raw) {
		t.Helper()
		if err := c.verify(ctx, language, r); err != nil {
			t.Errorf("%s: %v", name, err)
		}
	}
	bad := func(name string, language string, r Raw, want string) {
		t.Helper()
		err := c.verify(ctx, language, r)
		if err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("%s: want error containing %q, got %v", name, want, err)
		}
	}

	add := Test{Name: "adds", Code: `assert.strictEqual(add(1, 2), 3)`, Hidden: false}
	add2 := Test{Name: "adds more", Code: `assert.strictEqual(add(-1, 1), 0)`, Hidden: true}
	ok("javascript", "javascript", js("function add() {}", "function add(a, b) { return a + b }", add, add2))
	ok("const and class are visible to tests", "javascript", js("class A {}", "const k = 2\nclass A { twice(n) { return n * k } }", Test{Name: "c", Code: `assert.strictEqual(new A().twice(2), 4)`, Hidden: false}))
	// The learner's code can't reach the network, the page, or storage.
	ok("locked down", "javascript", js("function ready() { return false }", "function ready() { return typeof fetch === 'undefined' && typeof XMLHttpRequest === 'undefined' && typeof document === 'undefined' && typeof localStorage === 'undefined' && typeof importScripts === 'undefined' }", Test{Name: "no network or page", Code: `assert.strictEqual(ready(), true)`, Hidden: false}))

	// A hung program is stopped.
	start := time.Now()
	bad("infinite loop", "javascript", js("function f() { return 0 }", "function f() { while (true) {} }", Test{Name: "t", Code: `assert.strictEqual(f(), 1)`, Hidden: false}), "Timed out")
	if time.Since(start) > 40*time.Second {
		t.Errorf("infinite loop took %v to stop", time.Since(start))
	}
	bad("starter that already passes", "javascript", js("function f() { return 1 }", "function f() { return 1 }", Test{Name: "t", Code: `assert.strictEqual(f(), 1)`, Hidden: false}), "already passes")
	bad("wrong solution", "javascript", js("function f() {}", "function f() { return 2 }", Test{Name: "t", Code: `assert.strictEqual(f(), 1)`, Hidden: false}), "fails")
	bad("syntax error in solution", "javascript", js("function f() { return 0 }", "function f( {", Test{Name: "t", Code: `assert.strictEqual(f(), 1)`, Hidden: false}), "yntax")

	html := Raw{
		Starter:  map[string]string{"index.html": "<div class=box></div>", "style.css": "", "script.js": ""},
		Solution: map[string]string{"index.html": "<div class=box><button id=b>Go</button></div>", "style.css": ".box { display: flex; justify-content: center }", "script.js": "document.getElementById('b').addEventListener('click', e => e.target.textContent = 'Done')"},
		Tests: []Test{
			{Name: "flex", Code: `assert.equal(css(".box", "display"), "flex")`, Hidden: false},
			{Name: "button", Code: `assert.ok($("#b"), "button exists")`, Hidden: false},
			{Name: "click", Code: `$("#b").click(); assert.equal($("#b").textContent, "Done")`, Hidden: true},
		},
	}
	ok("html and css", "html", html)
}
