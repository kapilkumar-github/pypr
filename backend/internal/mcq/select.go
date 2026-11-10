package mcq

import (
	"regexp"
	"slices"
	"strings"

	"pypr/backend/internal/workspace"
)

var nonWord = regexp.MustCompile(`[^a-z0-9.+#/]+`)

func words(parts ...string) []string {
	out := []string{}
	for _, p := range parts {
		for _, w := range nonWord.Split(strings.ToLower(p), -1) {
			if w = strings.Trim(w, ".+/"); w != "" || strings.ContainsAny(p, "#") {
				out = append(out, w)
			}
		}
	}
	return out
}

// Selected returns the keys of the topics that match a workspace, best match first. A topic
// matches when one of its tags equals a word of the role, technologies or skills, appears in them
// as a phrase, or (tags ending in "*") starts a word. When nothing matches, the general software
// topics are returned so a workspace always has a starting set.
func Selected(w workspace.Workspace) []string {
	parts := []string{w.TargetRole, w.Seniority, strings.Join(w.Technologies, " , ")}
	for _, s := range w.Skills {
		parts = append(parts, s.Name)
	}
	if w.Track != "ic" && w.Track != "" {
		parts = append(parts, "management")
	}
	text := " " + strings.ToLower(strings.Join(parts, " , ")) + " "
	tokens := words(parts...)

	type scored struct {
		key   string
		score int
	}
	var hits []scored
	for _, t := range catalog.Topics {
		score := 0
		for _, tag := range t.Tags {
			switch {
			case strings.HasSuffix(tag, "*"):
				prefix := strings.TrimSuffix(tag, "*")
				if slices.ContainsFunc(tokens, func(tok string) bool { return strings.HasPrefix(tok, prefix) }) {
					score++
				}
			case strings.ContainsAny(tag, " /"):
				if strings.Contains(text, tag) {
					score++
				}
			case slices.Contains(tokens, tag):
				score++
			}
		}
		if score > 0 {
			hits = append(hits, scored{t.Key, score})
		}
	}
	if len(hits) == 0 {
		return []string{"data-structures-and-algorithms", "system-design"}
	}
	slices.SortStableFunc(hits, func(a, b scored) int { return b.score - a.score })
	out := make([]string, len(hits))
	for i, h := range hits {
		out[i] = h.key
	}
	return out
}
