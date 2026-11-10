package codeprob

import "testing"

func goodRaw() Raw {
	return Raw{
		Title: "Debounce", Difficulty: "easy", Statement: "Write a debounce function that delays calls until the input settles.",
		Starter: map[string]string{"index.js": "function debounce() {}"}, Solution: map[string]string{"index.js": "function debounce(f) { return f }"},
		Tests: []Test{{Name: "a", Code: "x"}, {Name: "b", Code: "x"}, {Name: "c", Code: "x", Hidden: true}, {Name: "d", Code: "x", Hidden: true}},
	}
}

func TestCheck(t *testing.T) {
	s := Spec{"node-js", KindMachine, "nodejs", RunnerServer}
	if err := check(s, goodRaw()); err != nil {
		t.Fatal(err)
	}
	for name, mut := range map[string]func(*Raw){
		"no title":        func(r *Raw) { r.Title = " " },
		"bad difficulty":  func(r *Raw) { r.Difficulty = "wild" },
		"missing starter": func(r *Raw) { r.Starter = map[string]string{} },
		"extra file":      func(r *Raw) { r.Solution["other.js"] = "" },
		"few tests":       func(r *Raw) { r.Tests = r.Tests[:3] },
		"no hidden": func(r *Raw) {
			r.Tests = []Test{{Name: "a", Code: "x", Hidden: false}, {Name: "b", Code: "x", Hidden: false}, {Name: "c", Code: "x", Hidden: false}, {Name: "d", Code: "x", Hidden: false}}
		},
		"all hidden": func(r *Raw) {
			r.Tests = []Test{{Name: "a", Code: "x", Hidden: true}, {Name: "b", Code: "x", Hidden: true}, {Name: "c", Code: "x", Hidden: true}, {Name: "d", Code: "x", Hidden: true}}
		},
		"empty test code": func(r *Raw) { r.Tests[0].Code = "" },
	} {
		r := goodRaw()
		mut(&r)
		if check(s, r) == nil {
			t.Errorf("%s should be rejected", name)
		}
	}
	html := Spec{"html-and-css", KindMachine, "html", RunnerBrowser}
	if check(html, goodRaw()) == nil {
		t.Error("an html problem needs index.html, style.css and script.js")
	}
}

func TestHashTitle(t *testing.T) {
	if hashTitle("dsa", "Two Sum!") != hashTitle("dsa", "two  sum") || hashTitle("dsa", "a") == hashTitle("machine_coding", "a") {
		t.Error("hash ignores case and punctuation, and separates kinds")
	}
}

func TestAttemptValidate(t *testing.T) {
	ok := AttemptInput{Files: Files{"index.js": "x"}, Passed: 1, Total: 2}
	if len(ok.validate()) != 0 {
		t.Fatal("valid attempt rejected")
	}
	if len((AttemptInput{Files: Files{"index.js": "x"}, Passed: 3, Total: 2}).validate()) == 0 {
		t.Error("passed > total must fail")
	}
}
