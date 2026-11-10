package design

import (
	"strings"
	"testing"
)

func TestTextIncludesRolesAndNotes(t *testing.T) {
	doc := `{"nodes":[
	  {"id":"1","data":{"kind":"cache","label":"Redis","role":"  caches   hot short codes\nfor redirects "}},
	  {"id":"2","data":{"kind":"sqldb","label":""}}],
	 "edges":[{"source":"1","target":"2","label":"miss"}],
	 "notes":[{"title":"Estimates","text":"10M DAU"}]}`
	got := text([]byte(doc))
	for _, want := range []string{"- Redis (cache): caches hot short codes for redirects\n", "- sqldb (sqldb)\n", "- Redis -> sqldb (miss)", `Note "Estimates":` + "\n10M DAU"} {
		if !strings.Contains(got, want) {
			t.Errorf("missing %q in:\n%s", want, got)
		}
	}
}
