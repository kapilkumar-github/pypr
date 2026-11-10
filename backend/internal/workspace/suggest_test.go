package workspace

import (
	"strings"
	"testing"
)

func titles(in []ActivityInput) string {
	out := []string{}
	for _, a := range in {
		out = append(out, a.Title)
	}
	return strings.Join(out, " | ")
}

func TestSuggestFollowsContext(t *testing.T) {
	w := Workspace{
		TargetRole: "Lead Backend Engineer", Seniority: "Lead", Track: "ic", Modules: []string{"mock_interviews"},
		Skills: []Skill{
			{Key: "go", Name: "Go", SelfLevel: "advanced"},
			{Key: "database-sharding", Name: "Database sharding", SelfLevel: "beginner"},
			{Key: "kafka", Name: "Kafka", SelfLevel: "unassessed"},
			{Key: "caching", Name: "Caching", SelfLevel: "intermediate"},
		},
	}
	got := Suggest(w, nil)
	all := titles(got)
	for _, want := range []string{"Learn Database sharding", "Deepen Caching", "Review Kafka",
		"Practice 3 system design problems", "Complete 3 mock interviews", "Review leadership interview questions"} {
		if !strings.Contains(all, want) {
			t.Errorf("missing %q in %s", want, all)
		}
	}
	if strings.Contains(all, "Go") && strings.Contains(all, "Learn Go") {
		t.Errorf("suggested an advanced skill: %s", all)
	}
	if got[0].Title != "Review Kafka" && got[0].Title != "Learn Database sharding" {
		t.Errorf("weakest skills should come first: %s", all)
	}
	for _, a := range got {
		if errs := a.validate(); len(errs) > 0 {
			t.Errorf("%s invalid: %v", a.Title, errs)
		}
		if a.Title == "Complete 3 mock interviews" && (a.Progress != "count" || *a.Target != 3) {
			t.Errorf("mock interviews should be count 3: %+v", a)
		}
	}
	if strings.Contains(all, "people-management") {
		t.Errorf("IC track got management items: %s", all)
	}
}

func TestSuggestSkipsExisting(t *testing.T) {
	key := "database-sharding"
	w := Workspace{TargetRole: "Engineering Manager", Track: "management", Modules: []string{"mock_interviews"},
		Skills: []Skill{{Key: key, Name: "Database sharding", SelfLevel: "beginner"}}}
	existing := []Activity{{Title: "Read about sharding", SkillKey: &key}, {Title: "prepare star stories"},
		{Kind: "mock_interview", Progress: "count", Title: "Do 5 mock interviews"}}
	all := titles(Suggest(w, existing))
	if strings.Contains(all, "sharding") || strings.Contains(all, "STAR") || strings.Contains(all, "mock interviews") {
		t.Errorf("suggested something already planned: %s", all)
	}
	if !strings.Contains(all, "people-management") || strings.Contains(all, "system design") {
		t.Errorf("management track suggestions wrong: %s", all)
	}
}

func TestFromPlanned(t *testing.T) {
	w := Workspace{Skills: []Skill{{Key: "kafka", Name: "Kafka"}}}
	existing := []Activity{{Title: "Learn Kafka"}}
	got := fromPlanned([]PlannedActivity{
		{Kind: "concept", Title: "learn kafka", Progress: "check"},                          // already planned
		{Kind: "concept", Title: "Study event sourcing", Progress: "check", Skill: "kafka"}, // ok, links skill
		{Kind: "mock_interview", Title: "Do mocks", Progress: "count", Target: 0},           // invalid target
		{Kind: "hacking", Title: "x", Progress: "check"},                                    // invalid kind
		{Kind: "behavioral", Title: "STAR stories", Progress: "checklist", Checklist: []string{"Conflict", ""}, Priority: "HIGH"},
		{Kind: "concept", Title: "Study event sourcing", Progress: "check"}, // duplicate
	}, w, existing)
	if len(got) != 2 {
		t.Fatalf("want 2 valid suggestions, got %s", titles(got))
	}
	if got[0].SkillKey == nil || *got[0].SkillKey != "kafka" {
		t.Errorf("skill not linked: %+v", got[0])
	}
	if got[1].Priority != "high" || len(got[1].Checklist) != 1 {
		t.Errorf("checklist not cleaned: %+v", got[1])
	}
}
