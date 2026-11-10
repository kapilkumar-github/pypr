// Package workspace owns preparation workspaces: one career goal, its context, the user's
// preparation plan and how each activity progresses. See docs/workspaces.md.
package workspace

import (
	"crypto/rand"
	"regexp"
	"slices"
	"strings"
	"time"
	"unicode/utf8"
)

// Optional modules a workspace can turn on. None is built yet; enabling one shapes suggestions,
// and a future module reads the flag. The plan, knowledge and progress views are always on.
var Modules = []string{"system_design", "coding", "mock_interviews", "behavioral", "leadership"}

var (
	tracks     = []string{"ic", "management", "both"}
	kinds      = []string{"concept", "system_design", "coding", "mock_interview", "behavioral", "custom"}
	priorities = []string{"high", "medium", "low"}
	statuses   = []string{"todo", "in_progress", "done"}
	progresses = []string{"check", "count", "checklist"}
	// Levels, lowest first. "ready" means interview-ready.
	levels = []string{"unassessed", "beginner", "intermediate", "advanced", "ready"}
)

const (
	maxActivities = 200
	maxBatch      = 50
)

type Workspace struct {
	ID              string      `json:"id"`
	Name            string      `json:"name"`
	TargetRole      string      `json:"targetRole"`
	Seniority       string      `json:"seniority"`
	Track           string      `json:"track"`
	YearsExperience *int        `json:"yearsExperience"`
	Technologies    []string    `json:"technologies"`
	Objectives      string      `json:"objectives"`
	JobDescription  string      `json:"jobDescription"`
	Modules         []string    `json:"modules"`
	Resumes         []ResumeRef `json:"resumes"`
	Skills          []Skill     `json:"skills"`
	ContextVersion  int         `json:"contextVersion"`
	CreatedAt       time.Time   `json:"createdAt"`
	UpdatedAt       time.Time   `json:"updatedAt"`
}

type ResumeRef struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

// Skill is the person's knowledge of one skill, shared by all their workspaces.
type Skill struct {
	Key       string `json:"key"`
	Name      string `json:"name"`
	Area      string `json:"area"`
	SelfLevel string `json:"selfLevel"`
	// Set only by assessments or mock interviews (future modules), never by the user.
	DemonstratedLevel *string `json:"demonstratedLevel"`
}

type Summary struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	TargetRole   string    `json:"targetRole"`
	Seniority    string    `json:"seniority"`
	Technologies []string  `json:"technologies"`
	Total        int       `json:"activitiesTotal"`
	Done         int       `json:"activitiesDone"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type SkillInput struct {
	Name string `json:"name"`
	Area string `json:"area"`
}

type input struct {
	Name            string       `json:"name"`
	TargetRole      string       `json:"targetRole"`
	Seniority       string       `json:"seniority"`
	Track           string       `json:"track"`
	YearsExperience *int         `json:"yearsExperience"`
	Technologies    []string     `json:"technologies"`
	Objectives      string       `json:"objectives"`
	JobDescription  string       `json:"jobDescription"`
	Modules         []string     `json:"modules"`
	ResumeIDs       []string     `json:"resumeIds"`
	Skills          []SkillInput `json:"skills"`
}

var uuidPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

// validate trims and normalizes in place and returns field errors.
func (in *input) validate() map[string]string {
	errs := map[string]string{}
	in.TargetRole = clean(in.TargetRole)
	if in.TargetRole == "" || runes(in.TargetRole) > 120 {
		errs["targetRole"] = "Enter the role you're preparing for (up to 120 characters)."
	}
	in.Name = clean(in.Name)
	if in.Name == "" {
		in.Name = in.TargetRole
	}
	if runes(in.Name) > 120 {
		errs["name"] = "Use up to 120 characters."
	}
	in.Seniority = clean(in.Seniority)
	if runes(in.Seniority) > 40 {
		errs["seniority"] = "Use up to 40 characters."
	}
	if in.Track == "" {
		in.Track = "ic"
	}
	if !slices.Contains(tracks, in.Track) {
		errs["track"] = "Choose individual contributor, management or both."
	}
	if y := in.YearsExperience; y != nil && (*y < 0 || *y > 60) {
		errs["yearsExperience"] = "Enter 0 to 60 years."
	}
	var ok bool
	if in.Technologies, ok = cleanList(in.Technologies, 20, 40); !ok {
		errs["technologies"] = "Add up to 20 technologies, each up to 40 characters."
	}
	in.Objectives = strings.TrimSpace(in.Objectives)
	if runes(in.Objectives) > 2000 {
		errs["objectives"] = "Use up to 2,000 characters."
	}
	in.JobDescription = strings.TrimSpace(in.JobDescription)
	if runes(in.JobDescription) > 20000 {
		errs["jobDescription"] = "Use up to 20,000 characters."
	}
	mods := []string{}
	for _, m := range in.Modules {
		if !slices.Contains(Modules, m) {
			errs["modules"] = "Unknown module."
		} else if !slices.Contains(mods, m) {
			mods = append(mods, m)
		}
	}
	in.Modules = mods
	ids := []string{}
	for _, id := range in.ResumeIDs {
		id = strings.ToLower(strings.TrimSpace(id))
		if !uuidPattern.MatchString(id) {
			errs["resumeIds"] = "Choose one of your resumes."
		} else if !slices.Contains(ids, id) {
			ids = append(ids, id)
		}
	}
	if len(ids) > 10 {
		errs["resumeIds"] = "Link up to 10 resumes."
	}
	in.ResumeIDs = ids
	skills := []SkillInput{}
	seen := map[string]bool{}
	for _, s := range in.Skills {
		s.Name, s.Area = clean(s.Name), clean(s.Area)
		key := SkillKey(s.Name)
		if key == "" || runes(s.Name) > 80 || runes(s.Area) > 60 {
			errs["skills"] = "Each skill needs a name (up to 80 characters)."
			continue
		}
		if !seen[key] {
			seen[key] = true
			skills = append(skills, s)
		}
	}
	if len(skills) > 40 {
		errs["skills"] = "Focus on up to 40 skills."
	}
	in.Skills = skills
	return errs
}

type ChecklistItem struct {
	ID   string `json:"id"`
	Text string `json:"text"`
	Done bool   `json:"done"`
}

type Completion struct {
	ID        string    `json:"id"`
	Source    string    `json:"source"`
	Note      string    `json:"note"`
	CreatedAt time.Time `json:"createdAt"`
}

// Activity is one step of a preparation plan.
type Activity struct {
	ID          string          `json:"id"`
	Kind        string          `json:"kind"`
	Title       string          `json:"title"`
	Description string          `json:"description"`
	Priority    string          `json:"priority"`
	Status      string          `json:"status"`
	Progress    string          `json:"progress"`
	Target      *int            `json:"target"`
	Completed   int             `json:"completed"`
	Checklist   []ChecklistItem `json:"checklist"`
	SkillKey    *string         `json:"skillKey"`
	Effort      *int            `json:"effortMinutes"`
	DueDate     *string         `json:"dueDate"`
	Criteria    string          `json:"criteria"`
	Position    int             `json:"position"`
	Completions []Completion    `json:"completions"`
	CompletedAt *time.Time      `json:"completedAt"`
	CreatedAt   time.Time       `json:"createdAt"`
	UpdatedAt   time.Time       `json:"updatedAt"`
}

// ActivityInput is what a user (or a suggestion) writes. Status is a request: count and checklist
// activities derive "done" from their progress.
type ActivityInput struct {
	Kind        string          `json:"kind"`
	Title       string          `json:"title"`
	Description string          `json:"description"`
	Priority    string          `json:"priority"`
	Status      string          `json:"status"`
	Progress    string          `json:"progress"`
	Target      *int            `json:"target"`
	Checklist   []ChecklistItem `json:"checklist"`
	SkillKey    *string         `json:"skillKey"`
	Effort      *int            `json:"effortMinutes"`
	DueDate     *string         `json:"dueDate"`
	Criteria    string          `json:"criteria"`
}

func (in *ActivityInput) validate() map[string]string {
	errs := map[string]string{}
	if !slices.Contains(kinds, in.Kind) {
		errs["kind"] = "Choose a type."
	}
	in.Title = clean(in.Title)
	if in.Title == "" || runes(in.Title) > 160 {
		errs["title"] = "Enter a title (up to 160 characters)."
	}
	in.Description = strings.TrimSpace(in.Description)
	if runes(in.Description) > 2000 {
		errs["description"] = "Use up to 2,000 characters."
	}
	if in.Priority == "" {
		in.Priority = "medium"
	}
	if !slices.Contains(priorities, in.Priority) {
		errs["priority"] = "Choose high, medium or low."
	}
	if in.Status == "" {
		in.Status = "todo"
	}
	if !slices.Contains(statuses, in.Status) {
		errs["status"] = "Choose a status."
	}
	if !slices.Contains(progresses, in.Progress) {
		errs["progress"] = "Choose how this activity is completed."
	}
	if in.Progress == "count" {
		if in.Target == nil || *in.Target < 1 || *in.Target > 100 {
			errs["target"] = "Enter a target from 1 to 100."
		}
	} else {
		in.Target = nil
	}
	if in.Progress == "checklist" {
		items := []ChecklistItem{}
		for _, it := range in.Checklist {
			it.Text = clean(it.Text)
			if it.Text == "" {
				continue
			}
			if runes(it.Text) > 200 {
				errs["checklist"] = "Keep each item under 200 characters."
			}
			if it.ID == "" || len(it.ID) > 40 {
				it.ID = newItemID()
			}
			items = append(items, it)
		}
		if len(items) == 0 || len(items) > 30 {
			errs["checklist"] = "Add 1 to 30 checklist items."
		}
		in.Checklist = items
	} else {
		in.Checklist = []ChecklistItem{}
	}
	if in.SkillKey != nil {
		if *in.SkillKey == "" {
			in.SkillKey = nil
		} else if !skillKeyPattern.MatchString(*in.SkillKey) {
			errs["skillKey"] = "Unknown skill."
		}
	}
	if e := in.Effort; e != nil && (*e < 1 || *e > 10000) {
		errs["effortMinutes"] = "Enter 1 to 10,000 minutes."
	}
	if in.DueDate != nil {
		if *in.DueDate == "" {
			in.DueDate = nil
		} else if _, err := time.Parse(time.DateOnly, *in.DueDate); err != nil {
			errs["dueDate"] = "Enter a date."
		}
	}
	in.Criteria = strings.TrimSpace(in.Criteria)
	if runes(in.Criteria) > 500 {
		errs["criteria"] = "Use up to 500 characters."
	}
	return errs
}

// deriveStatus applies the progress model. A check activity takes the requested status. Count and
// checklist activities are done only when their progress says so; "in progress" can be requested
// before the first completion.
func deriveStatus(progress, requested string, target *int, completed int, checklist []ChecklistItem) string {
	switch progress {
	case "count":
		if target != nil && completed >= *target {
			return "done"
		}
		if completed > 0 {
			return "in_progress"
		}
	case "checklist":
		done := 0
		for _, it := range checklist {
			if it.Done {
				done++
			}
		}
		if len(checklist) > 0 && done == len(checklist) {
			return "done"
		}
		if done > 0 {
			return "in_progress"
		}
	default:
		return requested
	}
	if requested == "in_progress" {
		return "in_progress"
	}
	return "todo"
}

var skillKeyPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,79}$`)
var nonSlug = regexp.MustCompile(`[^a-z0-9]+`)

// SkillKey is the stable ID of a skill name: "Database sharding" → "database-sharding",
// "C++" → "cplusplus". Empty when the name has no letters or digits.
func SkillKey(name string) string {
	s := strings.ToLower(strings.TrimSpace(name))
	s = strings.NewReplacer("++", "plusplus", "+", "plus", "#", "sharp").Replace(s)
	s = strings.Trim(nonSlug.ReplaceAllString(s, "-"), "-")
	if len(s) > 80 {
		s = strings.TrimRight(s[:80], "-")
	}
	return s
}

func newItemID() string { return strings.ToLower(rand.Text()[:10]) }

func clean(s string) string { return strings.Join(strings.Fields(s), " ") }

func runes(s string) int { return utf8.RuneCountInString(s) }

// cleanList trims, drops blanks and case-insensitive duplicates, and checks the limits.
func cleanList(in []string, maxItems, maxLen int) ([]string, bool) {
	out := []string{}
	ok := true
	for _, s := range in {
		s = clean(s)
		if s == "" || slices.ContainsFunc(out, func(o string) bool { return strings.EqualFold(o, s) }) {
			continue
		}
		if runes(s) > maxLen {
			ok = false
		}
		out = append(out, s)
	}
	return out, ok && len(out) <= maxItems
}
