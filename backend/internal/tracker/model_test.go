package tracker

import (
	"testing"
)

func TestNormalizeURL(t *testing.T) {
	same := [][2]string{
		{"https://www.Example.com/jobs/123/?utm_source=x&gh_src=abc#apply", "http://example.com/jobs/123"},
		{"https://boards.greenhouse.io/acme/jobs/42?b=2&a=1", "https://boards.greenhouse.io/acme/jobs/42?a=1&b=2&ref=linkedin"},
		{"https://example.com:443/x", "https://example.com/x"},
	}
	for _, c := range same {
		if a, b := normalizeURL(c[0]), normalizeURL(c[1]); a != b || a == "" {
			t.Errorf("normalizeURL(%q)=%q, normalizeURL(%q)=%q, want equal", c[0], a, c[1], b)
		}
	}
	different := [][2]string{
		{"https://acme.com/careers?gh_jid=1", "https://acme.com/careers?gh_jid=2"},
		{"https://jobs.lever.co/acme/a", "https://jobs.lever.co/acme/b"},
	}
	for _, c := range different {
		if normalizeURL(c[0]) == normalizeURL(c[1]) {
			t.Errorf("%q and %q should differ", c[0], c[1])
		}
	}
	if normalizeURL("not a url") != "" {
		t.Error("invalid URL should give empty key")
	}
}

func TestDetectSource(t *testing.T) {
	cases := []struct{ url, source, id string }{
		{"https://boards.greenhouse.io/acme/jobs/4012345", "greenhouse", "4012345"},
		{"https://job-boards.greenhouse.io/acme/jobs/77?gh_src=x", "greenhouse", "77"},
		{"https://acme.com/careers/open?gh_jid=555", "greenhouse", "555"},
		{"https://jobs.lever.co/acme/1b2c3d4e-aaaa-bbbb-cccc-1234567890ab/apply", "lever", "1b2c3d4e-aaaa-bbbb-cccc-1234567890ab"},
		{"https://acme.wd5.myworkdayjobs.com/en-US/External/job/Berlin/Senior-Engineer_R-12345", "workday", "R-12345"},
		{"https://acme.wd1.myworkdayjobs.com/External/job/NYC/Engineer_JR001/apply", "workday", "JR001"},
		{"https://apply.workable.com/acme/j/ABC123DEF/", "workable", "ABC123DEF"},
		{"https://jobs.ashbyhq.com/acme/0d9e8f7a-1111-2222-3333-444455556666", "ashby", "0d9e8f7a-1111-2222-3333-444455556666"},
		{"https://jobs.smartrecruiters.com/Acme/743999-backend-engineer", "smartrecruiters", "743999"},
		{"https://www.linkedin.com/jobs/view/3912345678/", "linkedin", "3912345678"},
		{"https://www.linkedin.com/jobs/search/?currentJobId=3912345678", "linkedin", "3912345678"},
		{"https://www.indeed.com/viewjob?jk=abc123", "indeed", "abc123"},
		{"https://careers.acme.com/jobs/42", "company_site", ""},
		{"", "", ""},
	}
	for _, c := range cases {
		s, id := DetectSource(c.url)
		if s != c.source || id != c.id {
			t.Errorf("DetectSource(%q) = %q, %q; want %q, %q", c.url, s, id, c.source, c.id)
		}
	}
}

func TestClassifyDuplicates(t *testing.T) {
	existing := candidate{
		Duplicate: Duplicate{Company: "Acme, Inc.", Title: "Backend Engineer", Source: "greenhouse", ExternalID: "100"},
		urlKeys:   urlKeys("https://boards.greenhouse.io/acme/jobs/100"),
		matchKey:  matchKey("Acme, Inc.", "Backend Engineer"),
	}
	cases := []struct {
		name string
		q    DuplicateQuery
		want string
	}{
		{"same url with tracking params", DuplicateQuery{DiscoveryURL: "https://boards.greenhouse.io/acme/jobs/100?gh_src=li&utm_medium=x", Company: "Other", Title: "Other"}, "url"},
		{"same ats and job id", DuplicateQuery{Source: "greenhouse", ExternalID: "100", Company: "Acme", Title: "Engineer"}, "external_id"},
		{"same company and title only", DuplicateQuery{Company: "acme inc", Title: "backend engineer"}, "company_title"},
		{"same title, different ats job id = separate role", DuplicateQuery{Source: "greenhouse", ExternalID: "101", Company: "Acme, Inc.", Title: "Backend Engineer"}, ""},
		{"different role at same company", DuplicateQuery{Company: "Acme, Inc.", Title: "Frontend Engineer"}, ""},
		{"empty", DuplicateQuery{}, ""},
	}
	for _, c := range cases {
		keys := urlKeys(c.q.DiscoveryURL, c.q.ApplicationURL)
		if got := classify(c.q, keys, existing); got != c.want {
			t.Errorf("%s: classify = %q, want %q", c.name, got, c.want)
		}
	}
}

func TestJobInputValidate(t *testing.T) {
	in := JobInput{Company: "  Acme\x00 ", Title: "Engineer", DiscoveryURL: "javascript:alert(1)", SalaryCurrency: "usd",
		SalaryMin: ptr(200.0), SalaryMax: ptr(100.0), Status: "applied"}
	errs := in.validate()
	for _, f := range []string{"discoveryUrl", "salaryMax", "status"} {
		if errs[f] == "" {
			t.Errorf("want error on %s, got %v", f, errs)
		}
	}
	if in.Company != "Acme" || in.SalaryCurrency != "USD" || in.WorkArrangement != "unknown" {
		t.Errorf("not normalized: %+v", in)
	}
	ok := JobInput{Company: "Acme", Title: "Engineer"}
	if errs := ok.validate(); len(errs) != 0 {
		t.Errorf("minimal manual entry should be valid, got %v", errs)
	}
}

func ptr[T any](v T) *T { return &v }
