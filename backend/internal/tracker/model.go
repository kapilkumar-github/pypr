// Package tracker is the job tracker: jobs a user saved or applied to, their status history,
// submitted resume snapshots, notes, interviews and next action. See docs/job-tracker.md.
package tracker

import (
	"encoding/json"
	"net/url"
	"regexp"
	"slices"
	"strings"
	"time"
	_ "time/tzdata" // interview time zones are validated without relying on the host's zoneinfo
	"unicode"
	"unicode/utf8"
)

var Statuses = []string{"saved", "preparing", "applied", "interviewing", "offer", "accepted", "rejected", "withdrawn", "closed"}

var arrangements = []string{"remote", "hybrid", "onsite", "unknown"}

// Sources a job can come from. ATS names are detected from the URL; the rest are picked by the user.
var sources = []string{"greenhouse", "lever", "workday", "workable", "ashby", "smartrecruiters", "linkedin", "indeed", "company_site", "referral", "other"}

var salaryPeriods = []string{"", "year", "month", "week", "day", "hour"}

const (
	maxDescription = 100_000
	maxNote        = 20_000
)

// Job is a tracked job as the API returns it.
type Job struct {
	ID              string     `json:"id"`
	Company         string     `json:"company"`
	Title           string     `json:"title"`
	Location        string     `json:"location"`
	WorkArrangement string     `json:"workArrangement"`
	EmploymentType  string     `json:"employmentType"`
	DiscoveryURL    string     `json:"discoveryUrl"`
	ApplicationURL  string     `json:"applicationUrl"`
	PortalURL       string     `json:"portalUrl"`
	ApplicationRef  string     `json:"applicationRef"`
	Source          string     `json:"source"`
	ExternalID      string     `json:"externalId"`
	SalaryMin       *float64   `json:"salaryMin"`
	SalaryMax       *float64   `json:"salaryMax"`
	SalaryCurrency  string     `json:"salaryCurrency"`
	SalaryPeriod    string     `json:"salaryPeriod"`
	Status          string     `json:"status"`
	AppliedAt       *time.Time `json:"appliedAt"`
	ResumeID        *string    `json:"resumeId"`
	ResumeTitle     *string    `json:"resumeTitle"`
	NextAction      NextAction `json:"nextAction"`
	CreatedAt       time.Time  `json:"createdAt"`
	UpdatedAt       time.Time  `json:"updatedAt"`
}

// NextAction is the one thing to do next for a job. Due dates are calendar dates (YYYY-MM-DD) the web
// app compares against the user's local date. No reminders are sent yet; the due index is ready for them.
type NextAction struct {
	Text   string     `json:"text"`
	Due    *string    `json:"due"`
	DoneAt *time.Time `json:"doneAt"`
}

// Detail is a job with everything that hangs off it.
type Detail struct {
	Job
	Description string        `json:"description"`
	History     []StatusEvent `json:"history"`
	Resumes     []Snapshot    `json:"resumes"`
	Notes       []Note        `json:"notes"`
	Interviews  []Interview   `json:"interviews"`
}

type StatusEvent struct {
	ID        string    `json:"id"`
	From      *string   `json:"from"`
	To        string    `json:"to"`
	CreatedAt time.Time `json:"createdAt"`
}

// Snapshot is a resume recorded for an application. Data is only returned by the snapshot endpoint.
type Snapshot struct {
	ID           string          `json:"id"`
	Kind         string          `json:"kind"`
	AtSubmission bool            `json:"atSubmission"`
	ResumeID     *string         `json:"resumeId"`
	Title        string          `json:"title"`
	Label        string          `json:"label"`
	Data         json.RawMessage `json:"data,omitempty"`
	CreatedAt    time.Time       `json:"createdAt"`
}

type Note struct {
	ID        string    `json:"id"`
	Body      string    `json:"body"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type Interview struct {
	ID          string     `json:"id"`
	Round       string     `json:"round"`
	ScheduledAt *time.Time `json:"scheduledAt"`
	Timezone    string     `json:"timezone"`
	MeetingURL  string     `json:"meetingUrl"`
	Notes       string     `json:"notes"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
}

// JobInput is the editable part of a job (create and update).
type JobInput struct {
	Company         string     `json:"company"`
	Title           string     `json:"title"`
	Location        string     `json:"location"`
	WorkArrangement string     `json:"workArrangement"`
	EmploymentType  string     `json:"employmentType"`
	DiscoveryURL    string     `json:"discoveryUrl"`
	ApplicationURL  string     `json:"applicationUrl"`
	PortalURL       string     `json:"portalUrl"`
	ApplicationRef  string     `json:"applicationRef"`
	Source          string     `json:"source"`
	ExternalID      string     `json:"externalId"`
	Description     string     `json:"description"`
	SalaryMin       *float64   `json:"salaryMin"`
	SalaryMax       *float64   `json:"salaryMax"`
	SalaryCurrency  string     `json:"salaryCurrency"`
	SalaryPeriod    string     `json:"salaryPeriod"`
	ResumeID        *string    `json:"resumeId"`
	AppliedAt       *time.Time `json:"appliedAt"`
	// Create only: saved as the first note.
	Note string `json:"note,omitempty"`
	// Create only: initial status (saved or preparing).
	Status string `json:"status,omitempty"`
	// Create only: the Idempotency-Key header, so a retried save returns the job it already made.
	ClientKey string `json:"-"`
}

func (in *JobInput) validate() map[string]string {
	errs := map[string]string{}
	text := func(field string, v *string, max int, required bool, msg string) {
		*v = cleanLine(*v)
		if (required && *v == "") || utf8.RuneCountInString(*v) > max {
			errs[field] = msg
		}
	}
	text("company", &in.Company, 200, true, "Enter the company (up to 200 characters).")
	text("title", &in.Title, 300, true, "Enter the job title (up to 300 characters).")
	text("location", &in.Location, 300, false, "Use up to 300 characters.")
	text("employmentType", &in.EmploymentType, 100, false, "Use up to 100 characters.")
	text("applicationRef", &in.ApplicationRef, 200, false, "Use up to 200 characters.")
	text("externalId", &in.ExternalID, 200, false, "Use up to 200 characters.")
	for field, v := range map[string]*string{
		"discoveryUrl": &in.DiscoveryURL, "applicationUrl": &in.ApplicationURL, "portalUrl": &in.PortalURL,
	} {
		*v = strings.TrimSpace(*v)
		if *v != "" && !validURL(*v) {
			errs[field] = "Enter a full web address starting with https:// or http://."
		}
	}
	if in.WorkArrangement == "" {
		in.WorkArrangement = "unknown"
	}
	if !slices.Contains(arrangements, in.WorkArrangement) {
		errs["workArrangement"] = "Choose remote, hybrid, onsite or unknown."
	}
	if in.Source != "" && !slices.Contains(sources, in.Source) {
		errs["source"] = "Choose a source from the list."
	}
	in.Description = cleanText(in.Description)
	if utf8.RuneCountInString(in.Description) > maxDescription {
		errs["description"] = "The description is too long (100,000 characters max)."
	}
	in.Note = cleanText(in.Note)
	if utf8.RuneCountInString(in.Note) > maxNote {
		errs["note"] = "Notes are limited to 20,000 characters."
	}
	in.SalaryCurrency = strings.ToUpper(strings.TrimSpace(in.SalaryCurrency))
	if in.SalaryCurrency != "" && !currencyRe.MatchString(in.SalaryCurrency) {
		errs["salaryCurrency"] = "Use a 3-letter currency code, like USD."
	}
	if !slices.Contains(salaryPeriods, in.SalaryPeriod) {
		errs["salaryPeriod"] = "Choose a pay period from the list."
	}
	for field, v := range map[string]*float64{"salaryMin": in.SalaryMin, "salaryMax": in.SalaryMax} {
		if v != nil && (*v < 0 || *v >= 1e10) {
			errs[field] = "Enter an amount between 0 and 9,999,999,999."
		}
	}
	if in.SalaryMin != nil && in.SalaryMax != nil && *in.SalaryMin > *in.SalaryMax {
		errs["salaryMax"] = "The maximum must be at least the minimum."
	}
	if in.Status == "" {
		in.Status = "saved"
	}
	if in.Status != "saved" && in.Status != "preparing" {
		errs["status"] = "New jobs start as saved or preparing. Confirm applying from the job."
	}
	if in.ResumeID != nil && *in.ResumeID == "" {
		in.ResumeID = nil
	}
	return errs
}

var currencyRe = regexp.MustCompile(`^[A-Z]{3}$`)

// cleanLine trims a single-line value and drops control characters.
func cleanLine(s string) string {
	return strings.TrimSpace(strings.Join(strings.FieldsFunc(s, func(r rune) bool {
		return unicode.IsControl(r) || unicode.IsSpace(r)
	}), " "))
}

// cleanText keeps line breaks and tabs, drops other control characters, and trims.
func cleanText(s string) string {
	s = strings.ReplaceAll(strings.ToValidUTF8(s, ""), "\r\n", "\n")
	return strings.TrimSpace(strings.Map(func(r rune) rune {
		if r == '\n' || r == '\t' || !unicode.IsControl(r) {
			return r
		}
		return -1
	}, s))
}

func validURL(raw string) bool {
	u, err := url.Parse(raw)
	return err == nil && (u.Scheme == "https" || u.Scheme == "http") && u.Host != "" && u.User == nil && len(raw) <= 2000
}

// trackingParams are query parameters that identify a click, not a job.
var trackingParams = map[string]bool{
	"ref": true, "refid": true, "src": true, "source": true, "trk": true, "trackingid": true,
	"gh_src": true, "lever-source": true, "lever-origin": true, "fbclid": true, "gclid": true,
	"mc_cid": true, "mc_eid": true, "_hsenc": true, "_hsmi": true, "iis": true, "iisn": true, "utm": true,
}

// normalizeURL makes a comparison key: lower-case host without www, no scheme, fragment, default port,
// tracking parameters or trailing slash; remaining parameters sorted.
func normalizeURL(raw string) string {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Host == "" {
		return ""
	}
	host := strings.TrimPrefix(strings.ToLower(u.Hostname()), "www.")
	if p := u.Port(); p != "" && p != "80" && p != "443" {
		host += ":" + p
	}
	q := u.Query()
	for k := range q {
		lk := strings.ToLower(k)
		if trackingParams[lk] || strings.HasPrefix(lk, "utm_") {
			q.Del(k)
		}
	}
	path := strings.TrimRight(u.EscapedPath(), "/")
	key := host + path
	if enc := q.Encode(); enc != "" { // Encode sorts by key
		key += "?" + enc
	}
	return key
}

func urlKeys(urls ...string) []string {
	keys := []string{}
	for _, u := range urls {
		if k := normalizeURL(u); k != "" && !slices.Contains(keys, k) {
			keys = append(keys, k)
		}
	}
	return keys
}

// matchKey is the weak duplicate signal: company and title, lower-case, letters and digits only.
func matchKey(company, title string) string {
	norm := func(s string) string {
		return strings.Map(func(r rune) rune {
			if unicode.IsLetter(r) || unicode.IsDigit(r) {
				return unicode.ToLower(r)
			}
			return -1
		}, s)
	}
	return norm(company) + "|" + norm(title)
}

var (
	workdayIDRe = regexp.MustCompile(`_([A-Za-z0-9-]+)(?:/apply.*)?$`)
	numericRe   = regexp.MustCompile(`^\d+$`)
	leadingIDRe = regexp.MustCompile(`^(\d+)`)
)

// DetectSource names the ATS or job site from a URL and pulls its job ID when the URL carries one.
// It only reads the address; it never guesses the company.
func DetectSource(raw string) (source, externalID string) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Host == "" {
		return "", ""
	}
	host := strings.TrimPrefix(strings.ToLower(u.Hostname()), "www.")
	parts := strings.FieldsFunc(u.Path, func(r rune) bool { return r == '/' })
	at := func(i int) string {
		if i < len(parts) {
			return parts[i]
		}
		return ""
	}
	q := u.Query()
	switch {
	case host == "boards.greenhouse.io" || host == "job-boards.greenhouse.io" || strings.HasSuffix(host, ".greenhouse.io"):
		for i, p := range parts {
			if p == "jobs" && numericRe.MatchString(at(i+1)) {
				return "greenhouse", at(i + 1)
			}
		}
		return "greenhouse", q.Get("gh_jid")
	case q.Get("gh_jid") != "":
		// Greenhouse embedded on a company's own careers page.
		return "greenhouse", q.Get("gh_jid")
	case host == "jobs.lever.co" || host == "jobs.eu.lever.co":
		return "lever", at(1)
	case strings.HasSuffix(host, ".myworkdayjobs.com") || strings.HasSuffix(host, ".myworkdaysite.com"):
		if m := workdayIDRe.FindStringSubmatch(u.Path); m != nil && slices.Contains(parts, "job") {
			return "workday", m[1]
		}
		return "workday", ""
	case host == "apply.workable.com":
		if at(1) == "j" {
			return "workable", at(2)
		}
		return "workable", ""
	case strings.HasSuffix(host, ".workable.com"):
		if at(0) == "jobs" || at(0) == "j" {
			return "workable", at(1)
		}
		return "workable", ""
	case host == "jobs.ashbyhq.com":
		return "ashby", at(1)
	case host == "jobs.smartrecruiters.com" || host == "careers.smartrecruiters.com":
		return "smartrecruiters", leadingIDRe.FindString(at(1))
	case host == "linkedin.com" || strings.HasSuffix(host, ".linkedin.com"):
		if id := q.Get("currentJobId"); numericRe.MatchString(id) {
			return "linkedin", id
		}
		for i, p := range parts {
			if p == "view" {
				// /jobs/view/123 or /jobs/view/some-title-123
				seg := at(i + 1)
				if j := strings.LastIndexByte(seg, '-'); j >= 0 {
					seg = seg[j+1:]
				}
				if numericRe.MatchString(seg) {
					return "linkedin", seg
				}
			}
		}
		return "linkedin", ""
	case host == "indeed.com" || strings.HasSuffix(host, ".indeed.com"):
		return "indeed", q.Get("jk")
	}
	return "company_site", ""
}

// Duplicate is an existing job that may be the same posting, with the strongest reason found.
type Duplicate struct {
	ID         string `json:"id"`
	Company    string `json:"company"`
	Title      string `json:"title"`
	Location   string `json:"location"`
	Status     string `json:"status"`
	Source     string `json:"source"`
	ExternalID string `json:"externalId"`
	// "url" and "external_id" are strong signals; "company_title" is weak.
	Reason    string    `json:"reason"`
	CreatedAt time.Time `json:"createdAt"`
}

type candidate struct {
	Duplicate
	urlKeys  []string
	matchKey string
}

// DuplicateQuery is what the user is about to save.
type DuplicateQuery struct {
	ExcludeID      string `json:"excludeId"`
	DiscoveryURL   string `json:"discoveryUrl"`
	ApplicationURL string `json:"applicationUrl"`
	Source         string `json:"source"`
	ExternalID     string `json:"externalId"`
	Company        string `json:"company"`
	Title          string `json:"title"`
}

// classify returns why c may duplicate q, or "" when it doesn't. Two postings on the same ATS with
// different job IDs are separate roles, even with the same company and title.
func classify(q DuplicateQuery, keys []string, c candidate) string {
	for _, k := range keys {
		if slices.Contains(c.urlKeys, k) {
			return "url"
		}
	}
	sameATS := q.Source != "" && q.Source == c.Source
	if sameATS && q.ExternalID != "" && c.ExternalID != "" {
		if strings.EqualFold(q.ExternalID, c.ExternalID) {
			return "external_id"
		}
		return ""
	}
	if mk := matchKey(q.Company, q.Title); mk != "|" && mk == c.matchKey {
		return "company_title"
	}
	return ""
}

var reasonRank = map[string]int{"url": 0, "external_id": 1, "company_title": 2}
