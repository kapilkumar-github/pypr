// Package resumeparse is the port for turning an uploaded resume file into structured fields.
// Domain code depends on Parser only; the result is sanitized here whatever the adapter returns.
package resumeparse

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"unicode/utf8"
)

// Document is an uploaded file.
type Document struct {
	Name string
	MIME string // application/pdf, DOCX or text/plain (see Kind)
	Data []byte
}

type Parser interface {
	Parse(ctx context.Context, doc Document) (Parsed, error)
}

// ErrUnreadable means the file has no usable resume text (scanned image, empty, not a resume).
var ErrUnreadable = errors.New("no resume text found")

// Parsed is a neutral resume shape. The web app maps it onto its own resume model.
// Dates are "YYYY-MM" or "".
type Parsed struct {
	FullName       string          `json:"fullName"`
	JobTitle       string          `json:"jobTitle"`
	Email          string          `json:"email"`
	Phone          string          `json:"phone"`
	Location       string          `json:"location"`
	Website        string          `json:"website"`
	LinkedIn       string          `json:"linkedin"`
	GitHub         string          `json:"github"`
	Summary        string          `json:"summary"`
	Experience     []Experience    `json:"experience"`
	Education      []Education     `json:"education"`
	Skills         []SkillGroup    `json:"skills"`
	Projects       []Project       `json:"projects"`
	Certifications []Certification `json:"certifications"`
	Languages      []Language      `json:"languages"`
	Awards         []Award         `json:"awards"`
	Volunteer      []Volunteer     `json:"volunteer"`
	Publications   []Publication   `json:"publications"`
	Interests      []Interest      `json:"interests"`
}

type Experience struct {
	Position  string   `json:"position"`
	Company   string   `json:"company"`
	Location  string   `json:"location"`
	StartDate string   `json:"startDate"`
	EndDate   string   `json:"endDate"`
	Current   bool     `json:"current"`
	Bullets   []string `json:"bullets"`
}

type Education struct {
	Institution string `json:"institution"`
	Degree      string `json:"degree"`
	Field       string `json:"field"`
	Location    string `json:"location"`
	StartDate   string `json:"startDate"`
	EndDate     string `json:"endDate"`
	GPA         string `json:"gpa"`
	Honors      string `json:"honors"`
}

type SkillGroup struct {
	Name   string   `json:"name"`
	Skills []string `json:"skills"`
}

type Project struct {
	Name      string   `json:"name"`
	Role      string   `json:"role"`
	URL       string   `json:"url"`
	StartDate string   `json:"startDate"`
	EndDate   string   `json:"endDate"`
	Bullets   []string `json:"bullets"`
}

type Certification struct {
	Name   string `json:"name"`
	Issuer string `json:"issuer"`
	Date   string `json:"date"`
	URL    string `json:"url"`
}

type Language struct {
	Name  string `json:"name"`
	Level string `json:"level"`
}

type Award struct {
	Title       string `json:"title"`
	Awarder     string `json:"awarder"`
	Date        string `json:"date"`
	Description string `json:"description"`
}

type Volunteer struct {
	Organization string   `json:"organization"`
	Position     string   `json:"position"`
	Location     string   `json:"location"`
	StartDate    string   `json:"startDate"`
	EndDate      string   `json:"endDate"`
	Bullets      []string `json:"bullets"`
}

type Publication struct {
	Name        string `json:"name"`
	Publisher   string `json:"publisher"`
	Date        string `json:"date"`
	URL         string `json:"url"`
	Description string `json:"description"`
}

type Interest struct {
	Name     string `json:"name"`
	Keywords string `json:"keywords"`
}

const (
	MIMEPDF  = "application/pdf"
	MIMEDOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
	MIMEText = "text/plain"
)

// Kind reports the supported type of a file by its name and declared type, or "".
func Kind(name, mime string) string {
	n := strings.ToLower(name)
	switch {
	case mime == MIMEPDF || strings.HasSuffix(n, ".pdf"):
		return MIMEPDF
	case mime == MIMEDOCX || strings.HasSuffix(n, ".docx"):
		return MIMEDOCX
	case strings.HasPrefix(mime, "text/plain") || strings.HasSuffix(n, ".txt") || strings.HasSuffix(n, ".md"):
		return MIMEText
	}
	return ""
}

// New selects an adapter by provider name. "" or "none" disables resume import (nil Parser).
func New(provider, apiKey string, models []string) (Parser, error) {
	switch provider {
	case "", "none":
		return nil, nil
	case "openrouter":
		if apiKey == "" {
			return nil, errors.New("AI_PROVIDER=openrouter needs OPENROUTER_API_KEY")
		}
		return NewOpenRouter(apiKey, models), nil
	default:
		return nil, fmt.Errorf("unknown RESUME_PARSER_PROVIDER %q", provider)
	}
}

// Fake returns a fixed result for tests.
type Fake struct{ Result Parsed }

func (f Fake) Parse(context.Context, Document) (Parsed, error) { return f.Result, nil }

var month = regexp.MustCompile(`^\d{4}-(0[1-9]|1[0-2])$`)

func clean(s string, max int) string {
	s = strings.Join(strings.Fields(s), " ")
	if utf8.RuneCountInString(s) > max {
		s = string([]rune(s)[:max])
	}
	return s
}

func date(s string) string {
	s = strings.TrimSpace(s)
	if len(s) == 4 && month.MatchString(s+"-01") {
		return s + "-01"
	}
	if month.MatchString(s) {
		return s
	}
	return ""
}

func lines(in []string, maxItems, maxLen int) []string {
	out := []string{}
	for _, s := range in {
		if s = clean(strings.TrimLeft(s, "•-–*· "), maxLen); s != "" && len(out) < maxItems {
			out = append(out, s)
		}
	}
	return out
}

func capList[T any](in []T, max int) []T {
	if in == nil {
		return []T{}
	}
	if len(in) > max {
		return in[:max]
	}
	return in
}

// Sanitize trims, caps and normalizes every field so model output can't produce oversized or odd data.
func Sanitize(p Parsed) Parsed {
	const short, long = 200, 2000
	p.FullName, p.JobTitle = clean(p.FullName, short), clean(p.JobTitle, short)
	p.Email, p.Phone, p.Location = clean(p.Email, short), clean(p.Phone, 60), clean(p.Location, short)
	p.Website, p.LinkedIn, p.GitHub = clean(p.Website, short), clean(p.LinkedIn, short), clean(p.GitHub, short)
	p.Summary = clean(p.Summary, long)

	p.Experience = capList(p.Experience, 30)
	for i := range p.Experience {
		e := &p.Experience[i]
		e.Position, e.Company, e.Location = clean(e.Position, short), clean(e.Company, short), clean(e.Location, short)
		e.StartDate, e.EndDate = date(e.StartDate), date(e.EndDate)
		if e.Current {
			e.EndDate = ""
		}
		e.Bullets = lines(e.Bullets, 15, 600)
	}
	p.Education = capList(p.Education, 15)
	for i := range p.Education {
		e := &p.Education[i]
		e.Institution, e.Degree, e.Field = clean(e.Institution, short), clean(e.Degree, short), clean(e.Field, short)
		e.Location, e.GPA, e.Honors = clean(e.Location, short), clean(e.GPA, 40), clean(e.Honors, short)
		e.StartDate, e.EndDate = date(e.StartDate), date(e.EndDate)
	}
	p.Skills = capList(p.Skills, 20)
	for i := range p.Skills {
		p.Skills[i].Name = clean(p.Skills[i].Name, 80)
		p.Skills[i].Skills = lines(p.Skills[i].Skills, 60, 80)
	}
	p.Projects = capList(p.Projects, 20)
	for i := range p.Projects {
		x := &p.Projects[i]
		x.Name, x.Role, x.URL = clean(x.Name, short), clean(x.Role, short), clean(x.URL, short)
		x.StartDate, x.EndDate = date(x.StartDate), date(x.EndDate)
		x.Bullets = lines(x.Bullets, 10, 600)
	}
	p.Certifications = capList(p.Certifications, 30)
	for i := range p.Certifications {
		c := &p.Certifications[i]
		c.Name, c.Issuer, c.URL, c.Date = clean(c.Name, short), clean(c.Issuer, short), clean(c.URL, short), date(c.Date)
	}
	p.Languages = capList(p.Languages, 20)
	for i := range p.Languages {
		p.Languages[i].Name, p.Languages[i].Level = clean(p.Languages[i].Name, 80), clean(p.Languages[i].Level, 80)
	}
	p.Awards = capList(p.Awards, 20)
	for i := range p.Awards {
		a := &p.Awards[i]
		a.Title, a.Awarder, a.Date, a.Description = clean(a.Title, short), clean(a.Awarder, short), date(a.Date), clean(a.Description, long)
	}
	p.Volunteer = capList(p.Volunteer, 20)
	for i := range p.Volunteer {
		v := &p.Volunteer[i]
		v.Organization, v.Position, v.Location = clean(v.Organization, short), clean(v.Position, short), clean(v.Location, short)
		v.StartDate, v.EndDate = date(v.StartDate), date(v.EndDate)
		v.Bullets = lines(v.Bullets, 10, 600)
	}
	p.Publications = capList(p.Publications, 20)
	for i := range p.Publications {
		x := &p.Publications[i]
		x.Name, x.Publisher, x.URL, x.Date, x.Description = clean(x.Name, short), clean(x.Publisher, short), clean(x.URL, short), date(x.Date), clean(x.Description, long)
	}
	p.Interests = capList(p.Interests, 20)
	for i := range p.Interests {
		p.Interests[i].Name, p.Interests[i].Keywords = clean(p.Interests[i].Name, 80), clean(p.Interests[i].Keywords, short)
	}
	return p
}

// Empty reports whether nothing useful was extracted.
func (p Parsed) Empty() bool {
	return p.FullName == "" && p.Summary == "" && len(p.Experience) == 0 && len(p.Education) == 0 && len(p.Skills) == 0
}
