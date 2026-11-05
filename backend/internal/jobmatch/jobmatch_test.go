package jobmatch

import "testing"

func TestSanitize(t *testing.T) {
	r := Sanitize(Requirements{
		MinYears: -3,
		Required: []Skill{
			{Name: "  Node.js ", Aliases: []string{"NodeJS", "node.js", " "}},
			{Name: "node.js"},
			{Name: ""},
		},
		NiceToHave: []Skill{{Name: "Apollo GraphQL"}},
	})
	if r.MinYears != 0 || len(r.Required) != 1 || r.Required[0].Name != "Node.js" {
		t.Fatalf("got %+v", r)
	}
	if a := r.Required[0].Aliases; len(a) != 1 || a[0] != "NodeJS" {
		t.Errorf("aliases %q", a)
	}
	if len(r.NiceToHave) != 1 || r.NiceToHave[0].Aliases == nil {
		t.Errorf("nice %+v", r.NiceToHave)
	}
}
