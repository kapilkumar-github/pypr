package workspace

import (
	"fmt"
	"slices"
	"strings"
)

const maxSkillSuggestions = 8

// Suggest proposes plan activities from the workspace context with fixed rules (no AI). Skills the
// user rates low come first. Nothing already in the plan is suggested again. The user picks which
// to add; nothing is saved here.
func Suggest(w Workspace, existing []Activity) []ActivityInput {
	have := func(title string, skill *string) bool {
		return slices.ContainsFunc(existing, func(a Activity) bool {
			return strings.EqualFold(a.Title, title) || (skill != nil && a.SkillKey != nil && *a.SkillKey == *skill)
		})
	}
	out := []ActivityInput{}
	add := func(a ActivityInput) {
		// One count goal per practice kind: "Practice 2 system design problems" covers "Practice 3 …".
		practice := a.Progress == "count" && slices.ContainsFunc(existing, func(e Activity) bool { return e.Kind == a.Kind && e.Progress == "count" })
		if !practice && !have(a.Title, a.SkillKey) && !slices.ContainsFunc(out, func(o ActivityInput) bool { return strings.EqualFold(o.Title, a.Title) }) {
			out = append(out, a)
		}
	}

	skills := slices.Clone(w.Skills)
	slices.SortStableFunc(skills, func(a, b Skill) int { return levelRank(a.SelfLevel) - levelRank(b.SelfLevel) })
	n := 0
	for _, s := range skills {
		if n == maxSkillSuggestions || levelRank(s.SelfLevel) >= levelRank("advanced") {
			break
		}
		key := s.Key
		a := ActivityInput{Kind: "concept", Progress: "check", SkillKey: &key, Priority: "medium",
			Criteria: "You can explain it and answer interview questions on it without notes."}
		switch s.SelfLevel {
		case "beginner":
			a.Title, a.Priority = "Learn "+s.Name, "high"
		case "intermediate":
			a.Title = "Deepen " + s.Name
		default:
			a.Title = "Review " + s.Name
			a.Description = "Rate this skill in Knowledge to get better suggestions."
		}
		if !have(a.Title, a.SkillKey) {
			n++
		}
		add(a)
	}

	senior, lead, manager := seniority(w)
	ic := w.Track != "management"
	if w.has("system_design") || (ic && senior) {
		target := 2
		if lead {
			target = 3
		}
		add(count("system_design", fmt.Sprintf("Practice %d system design problems", target), target,
			priority(senior), "Design end to end out loud: requirements, API, data model, scaling, trade-offs."))
	}
	if w.has("coding") {
		add(count("coding", "Solve 10 coding problems", 10, "medium", "Timed, in the language you'll interview in."))
	}
	if w.has("mock_interviews") {
		a := count("mock_interview", "Complete 3 mock interviews", 3, "high", "")
		a.Description = "Record each one here. Sessions from the mock interview module will count automatically once it's available."
		add(a)
	}
	if w.has("behavioral") || !ic {
		add(checklist("behavioral", "Prepare STAR stories", "high", []string{
			"A project you're proud of", "A conflict you resolved", "A failure and what you learned",
			"Influencing without authority", "Delivering under a tight deadline",
		}))
	}
	if w.has("leadership") || lead || manager {
		add(ActivityInput{Kind: "behavioral", Title: "Review leadership interview questions", Progress: "check", Priority: priority(manager),
			Criteria: "You have a concrete example for mentoring, decision-making and setting direction."})
	}
	if manager {
		add(checklist("behavioral", "Prepare people-management examples", "high", []string{
			"Hiring and building a team", "Growing a report", "Handling underperformance", "Setting team direction",
		}))
	}
	if w.JobDescription != "" {
		add(ActivityInput{Kind: "custom", Title: "Map your experience to the job description", Progress: "check", Priority: "high",
			Criteria: "Each requirement in the posting has an example from your experience."})
	}
	for i := range out {
		out[i].validate() // fills defaults; rule output is always valid
	}
	return out
}

func (w Workspace) has(module string) bool { return slices.Contains(w.Modules, module) }

func seniority(w Workspace) (senior, lead, manager bool) {
	s := strings.ToLower(w.Seniority + " " + w.TargetRole)
	mentions := func(words ...string) bool {
		return slices.ContainsFunc(words, func(word string) bool { return strings.Contains(s, word) })
	}
	lead = mentions("lead", "staff", "principal", "architect")
	manager = w.Track != "ic" || mentions("manager", "director", "head of", "vp")
	senior = lead || manager || mentions("senior", "sr.", "sr ")
	return
}

func levelRank(level string) int { return slices.Index(levels, level) }

func priority(high bool) string {
	if high {
		return "high"
	}
	return "medium"
}

func count(kind, title string, target int, prio, criteria string) ActivityInput {
	return ActivityInput{Kind: kind, Title: title, Progress: "count", Target: &target, Priority: prio, Criteria: criteria}
}

func checklist(kind, title, prio string, items []string) ActivityInput {
	a := ActivityInput{Kind: kind, Title: title, Progress: "checklist", Priority: prio}
	for _, it := range items {
		a.Checklist = append(a.Checklist, ChecklistItem{Text: it})
	}
	return a
}
