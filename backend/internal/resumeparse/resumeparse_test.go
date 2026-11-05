package resumeparse

import (
	"archive/zip"
	"bytes"
	"errors"
	"strings"
	"testing"
)

func TestKind(t *testing.T) {
	cases := map[[2]string]string{
		{"cv.PDF", ""}:                   MIMEPDF,
		{"cv", MIMEPDF}:                  MIMEPDF,
		{"cv.docx", ""}:                  MIMEDOCX,
		{"cv.txt", ""}:                   MIMEText,
		{"notes", "text/plain; utf8"}:    MIMEText,
		{"cv.doc", "application/msword"}: "",
		{"photo.png", "image/png"}:       "",
	}
	for in, want := range cases {
		if got := Kind(in[0], in[1]); got != want {
			t.Errorf("Kind(%q, %q) = %q, want %q", in[0], in[1], got, want)
		}
	}
}

func TestSanitize(t *testing.T) {
	p := Sanitize(Parsed{
		FullName: "  Ada   Lovelace ",
		Experience: []Experience{{
			Position: "Engineer", StartDate: "2020", EndDate: "2023-13", Current: true,
			Bullets: []string{"• Built things", "  ", strings.Repeat("x", 700)},
		}},
		Skills: []SkillGroup{{Name: "Skills", Skills: []string{"Go", "", "SQL"}}},
	})
	if p.FullName != "Ada Lovelace" {
		t.Errorf("name %q", p.FullName)
	}
	e := p.Experience[0]
	if e.StartDate != "2020-01" || e.EndDate != "" {
		t.Errorf("dates %q %q", e.StartDate, e.EndDate)
	}
	if len(e.Bullets) != 2 || e.Bullets[0] != "Built things" || len([]rune(e.Bullets[1])) != 600 {
		t.Errorf("bullets %q", e.Bullets)
	}
	if got := p.Skills[0].Skills; len(got) != 2 {
		t.Errorf("skills %q", got)
	}
	if p.Education == nil || p.Projects == nil {
		t.Error("lists must be [] not null")
	}
	if !(Parsed{}).Empty() || p.Empty() {
		t.Error("Empty")
	}
}

func TestDOCXText(t *testing.T) {
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	f, _ := zw.Create("word/document.xml")
	_, _ = f.Write([]byte(`<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>Ada</w:t></w:r><w:r><w:tab/><w:t>Lovelace</w:t></w:r></w:p><w:p><w:r><w:t>Engineer</w:t></w:r></w:p></w:body></w:document>`))
	_ = zw.Close()
	got, err := DOCXText(buf.Bytes())
	if err != nil || got != "Ada Lovelace\nEngineer" {
		t.Fatalf("got %q, %v", got, err)
	}
	if _, err := DOCXText([]byte("not a zip")); !errors.Is(err, ErrUnreadable) {
		t.Errorf("bad file error %v", err)
	}
}
