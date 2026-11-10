package mcq

import (
	"math/rand/v2"
	"slices"
	"testing"

	"pypr/backend/internal/workspace"
)

func TestCatalog(t *testing.T) {
	if len(catalog.Topics) < 30 {
		t.Fatalf("topics: %d", len(catalog.Topics))
	}
	for _, topic := range catalog.Topics {
		if topic.Key != workspace.SkillKey(topic.Name) || len(topic.Tags) == 0 {
			t.Errorf("bad topic %+v", topic)
		}
	}
}

func ws(role, seniority, track string, tech []string, skills ...string) workspace.Workspace {
	w := workspace.Workspace{TargetRole: role, Seniority: seniority, Track: track, Technologies: tech}
	for _, s := range skills {
		w.Skills = append(w.Skills, workspace.Skill{Name: s})
	}
	return w
}

func TestSelected(t *testing.T) {
	has := func(keys []string, want ...string) {
		t.Helper()
		for _, k := range want {
			if !slices.Contains(keys, k) {
				t.Errorf("%v should contain %s", keys, k)
			}
		}
	}
	lacks := func(keys []string, bad ...string) {
		t.Helper()
		for _, k := range bad {
			if slices.Contains(keys, k) {
				t.Errorf("%v should not contain %s", keys, k)
			}
		}
	}

	node := Selected(ws("Senior Software Engineer", "Senior", "ic", []string{"Node.js", "TypeScript", "PostgreSQL", "Redis", "AWS"}, "Docker"))
	has(node, "node-js", "typescript", "postgresql", "redis", "aws", "docker", "system-design", "data-structures-and-algorithms")
	lacks(node, "java", "react", "engineering-management")

	react := Selected(ws("Frontend Developer", "Mid-level", "ic", []string{"React", "Next.js", "CSS"}))
	has(react, "react", "html-and-css", "javascript")
	lacks(react, "kubernetes", "engineering-management")

	lead := Selected(ws("Lead Software Engineer, Backend", "Lead", "ic", []string{"Go", "Kafka"}))
	has(lead, "go", "kafka", "system-design", "low-level-design", "engineering-management")

	mgr := Selected(ws("Engineering Manager", "Manager", "management", nil))
	has(mgr, "engineering-management", "agile-and-scrum")

	// Nothing recognisable still gives a starting set.
	has(Selected(ws("Underwater Basket Weaver", "", "ic", nil)), "data-structures-and-algorithms", "system-design")
}

func TestCheckShufflesAndKeepsAnswer(t *testing.T) {
	rng := rand.New(rand.NewPCG(1, 2))
	positions := map[int]int{}
	for range 200 {
		q, ok := Check(RawQuestion{Question: " What? ", Options: []string{"right", "b", "c", "d"}, Answer: 0, Explanation: "Because."}, rng)
		if !ok || q.Options[q.Answer] != "right" || q.Difficulty != "medium" || q.Question != "What?" {
			t.Fatalf("bad result %+v", q)
		}
		positions[q.Answer]++
	}
	for p := 0; p < 4; p++ {
		if positions[p] < 20 {
			t.Errorf("correct answer lands in position %d only %d/200 times", p, positions[p])
		}
	}
	for name, r := range map[string]RawQuestion{
		"three options":  {Question: "q", Options: []string{"a", "b", "c"}, Explanation: "e"},
		"duplicate":      {Question: "q", Options: []string{"a", "A", "c", "d"}, Explanation: "e"},
		"bad answer":     {Question: "q", Options: []string{"a", "b", "c", "d"}, Answer: 4, Explanation: "e"},
		"no explanation": {Question: "q", Options: []string{"a", "b", "c", "d"}},
		"all of above":   {Question: "q", Options: []string{"a", "b", "c", "All of the above"}, Explanation: "e"},
	} {
		if _, ok := Check(r, rng); ok {
			t.Errorf("%s should be rejected", name)
		}
	}
}

func TestHashIgnoresCaseAndPunctuation(t *testing.T) {
	if Hash("What does `await` do?") != Hash("what does await do") || Hash("a") == Hash("b") {
		t.Error("hash must ignore case and punctuation only")
	}
}
