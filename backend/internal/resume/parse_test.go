package resume

import (
	"errors"
	"io"
	"log/slog"
	"testing"

	"pypr/backend/internal/resumeparse"
)

func TestRunImport(t *testing.T) {
	h := &Handler{
		log:    slog.New(slog.NewTextHandler(io.Discard, nil)),
		parser: resumeparse.Fake{Result: resumeparse.Parsed{FullName: " Ada  Lovelace "}},
	}
	p, err := h.runImport("u1", resumeparse.Document{MIME: resumeparse.MIMEText})
	if err != nil || p.FullName != "Ada Lovelace" {
		t.Fatalf("result must be sanitized: %+v %v", p, err)
	}
	h.parser = resumeparse.Fake{}
	if _, err := h.runImport("u1", resumeparse.Document{MIME: resumeparse.MIMEText}); !errors.Is(err, resumeparse.ErrUnreadable) {
		t.Fatalf("empty result must be unreadable, got %v", err)
	}
}
