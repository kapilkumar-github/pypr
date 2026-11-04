package resume

import (
	"strings"
	"testing"
)

func TestInputValidate(t *testing.T) {
	cases := []struct {
		name  string
		in    input
		field string
	}{
		{"ok", input{Title: " My resume ", Data: []byte(`{"a":1}`)}, ""},
		{"blank title", input{Title: "  ", Data: []byte(`{}`)}, "title"},
		{"long title", input{Title: strings.Repeat("x", 201), Data: []byte(`{}`)}, "title"},
		{"array data", input{Title: "t", Data: []byte(`[]`)}, "data"},
		{"missing data", input{Title: "t"}, "data"},
		{"too large", input{Title: "t", Data: []byte(`{"a":"` + strings.Repeat("x", maxDataBytes) + `"}`)}, "data"},
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
	in := input{Title: " My resume ", Data: []byte(`{}`)}
	in.validate()
	if in.Title != "My resume" {
		t.Fatalf("title not trimmed: %q", in.Title)
	}
}

func TestStripContact(t *testing.T) {
	in := []byte(`{"personalInfo":{"fullName":"Ada","email":"a@b.c","phone":"1","links":[{"url":"x"}]},"references":[{"name":"Bob","contact":"bob@x"}]}`)
	out, err := stripContact(in)
	if err != nil {
		t.Fatal(err)
	}
	s := string(out)
	for _, leaked := range []string{"a@b.c", `"phone":"1"`, `"url":"x"`, "bob@x"} {
		if strings.Contains(s, leaked) {
			t.Fatalf("%q still in %s", leaked, s)
		}
	}
	if !strings.Contains(s, "Ada") || !strings.Contains(s, "Bob") {
		t.Fatalf("names removed: %s", s)
	}
}

func TestSlugPattern(t *testing.T) {
	for slug, ok := range map[string]bool{"kapil-kumar": true, "ab": false, "-ab": false, "ab-": false, "Ab1": false, "a1b": true} {
		if slugPattern.MatchString(slug) != ok {
			t.Errorf("%q: want %v", slug, ok)
		}
	}
}
