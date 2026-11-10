package workspace

import (
	"strings"
	"testing"
)

func ptr[T any](v T) *T { return &v }

func TestInputValidate(t *testing.T) {
	cases := []struct {
		name  string
		in    input
		field string
	}{
		{"ok", input{TargetRole: " Lead Backend Engineer "}, ""},
		{"no role", input{TargetRole: " "}, "targetRole"},
		{"bad track", input{TargetRole: "x", Track: "boss"}, "track"},
		{"years", input{TargetRole: "x", YearsExperience: ptr(61)}, "yearsExperience"},
		{"module", input{TargetRole: "x", Modules: []string{"chess"}}, "modules"},
		{"resume id", input{TargetRole: "x", ResumeIDs: []string{"1 or 1=1"}}, "resumeIds"},
		{"skill", input{TargetRole: "x", Skills: []SkillInput{{Name: "!!"}}}, "skills"},
		{"tech too long", input{TargetRole: "x", Technologies: []string{strings.Repeat("g", 41)}}, "technologies"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			errs := c.in.validate()
			if c.field == "" && len(errs) > 0 {
				t.Fatalf("unexpected errors %v", errs)
			}
			if c.field != "" && errs[c.field] == "" {
				t.Fatalf("expected error on %s, got %v", c.field, errs)
			}
		})
	}

	in := input{TargetRole: " Lead  Backend ", Technologies: []string{"Go", "go", " Node.js "},
		Modules: []string{"coding", "coding"}, Skills: []SkillInput{{Name: "Go concurrency"}, {Name: "go  concurrency"}}}
	in.validate()
	if in.Name != "Lead Backend" || in.Track != "ic" {
		t.Fatalf("defaults not applied: %+v", in)
	}
	if len(in.Technologies) != 2 || len(in.Modules) != 1 || len(in.Skills) != 1 {
		t.Fatalf("duplicates kept: %+v", in)
	}
}

func TestActivityValidate(t *testing.T) {
	ok := []ActivityInput{
		{Kind: "concept", Title: "Learn sharding", Progress: "check"},
		{Kind: "mock_interview", Title: "Complete 3 mock interviews", Progress: "count", Target: ptr(3)},
		{Kind: "concept", Title: "Review Go concurrency", Progress: "checklist", Checklist: []ChecklistItem{{Text: "Channels"}}},
	}
	for _, a := range ok {
		if errs := a.validate(); len(errs) > 0 {
			t.Errorf("%s: %v", a.Title, errs)
		}
	}
	bad := map[string]ActivityInput{
		"kind":      {Kind: "quiz", Title: "x", Progress: "check"},
		"title":     {Kind: "custom", Progress: "check"},
		"target":    {Kind: "custom", Title: "x", Progress: "count"},
		"checklist": {Kind: "custom", Title: "x", Progress: "checklist", Checklist: []ChecklistItem{{Text: " "}}},
		"dueDate":   {Kind: "custom", Title: "x", Progress: "check", DueDate: ptr("next week")},
		"skillKey":  {Kind: "custom", Title: "x", Progress: "check", SkillKey: ptr("Not A Key")},
	}
	for field, a := range bad {
		if errs := a.validate(); errs[field] == "" {
			t.Errorf("expected error on %s, got %v", field, errs)
		}
	}

	a := ActivityInput{Kind: "custom", Title: "x", Progress: "check", Target: ptr(5), Checklist: []ChecklistItem{{Text: "a"}}, SkillKey: ptr("")}
	a.validate()
	if a.Target != nil || len(a.Checklist) != 0 || a.SkillKey != nil || a.Priority != "medium" || a.Status != "todo" {
		t.Fatalf("fields not normalized for check progress: %+v", a)
	}
	c := ActivityInput{Kind: "custom", Title: "x", Progress: "checklist", Checklist: []ChecklistItem{{Text: "a"}}}
	c.validate()
	if c.Checklist[0].ID == "" {
		t.Fatal("checklist item has no id")
	}
}

func TestDeriveStatus(t *testing.T) {
	three := ptr(3)
	items := func(done ...bool) []ChecklistItem {
		out := []ChecklistItem{}
		for _, d := range done {
			out = append(out, ChecklistItem{Text: "x", Done: d})
		}
		return out
	}
	cases := []struct {
		progress, requested string
		target              *int
		completed           int
		checklist           []ChecklistItem
		want                string
	}{
		{"check", "done", nil, 0, nil, "done"},
		{"check", "in_progress", nil, 0, nil, "in_progress"},
		{"count", "done", three, 0, nil, "todo"}, // can't claim done without completions
		{"count", "todo", three, 1, nil, "in_progress"},
		{"count", "todo", three, 3, nil, "done"},
		{"count", "in_progress", three, 0, nil, "in_progress"},
		{"checklist", "done", nil, 0, items(true, false), "in_progress"},
		{"checklist", "todo", nil, 0, items(true, true), "done"},
		{"checklist", "todo", nil, 0, items(false, false), "todo"},
	}
	for _, c := range cases {
		if got := deriveStatus(c.progress, c.requested, c.target, c.completed, c.checklist); got != c.want {
			t.Errorf("%s/%s/%d: got %s, want %s", c.progress, c.requested, c.completed, got, c.want)
		}
	}
}

func TestSkillKey(t *testing.T) {
	for name, want := range map[string]string{
		"Database sharding": "database-sharding",
		" Go  Concurrency ": "go-concurrency",
		"Node.js":           "node-js",
		"C++":               "cplusplus",
		"C#":                "csharp",
		"!!":                "",
	} {
		if got := SkillKey(name); got != want {
			t.Errorf("SkillKey(%q) = %q, want %q", name, got, want)
		}
	}
	if k := SkillKey(strings.Repeat("ab-", 40)); len(k) > 80 || !skillKeyPattern.MatchString(k) {
		t.Errorf("long key %q", k)
	}
}
