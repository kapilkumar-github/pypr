package resume

import (
	"io"
	"log/slog"
	"testing"

	"pypr/backend/internal/resumeparse"
)

func TestImportJobs(t *testing.T) {
	h := &Handler{
		log:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		parser:  resumeparse.Fake{Result: resumeparse.Parsed{FullName: " Ada  Lovelace "}},
		imports: newImportJobs(),
	}
	id := h.imports.start("u1")
	if j, ok := h.imports.get(id, "u1"); !ok || j.done {
		t.Fatalf("new job must be pending: %+v %v", j, ok)
	}
	if _, ok := h.imports.get(id, "u2"); ok {
		t.Fatal("other users must not see the job")
	}
	h.runImport(id, "u1", resumeparse.Document{Name: "cv.txt", MIME: resumeparse.MIMEText, Data: []byte("x")})
	j, _ := h.imports.get(id, "u1")
	if !j.done || j.err != nil || j.result.FullName != "Ada Lovelace" {
		t.Fatalf("finished job: %+v", j)
	}

	h.parser = resumeparse.Fake{} // empty result
	id = h.imports.start("u1")
	h.runImport(id, "u1", resumeparse.Document{MIME: resumeparse.MIMEText})
	if j, _ := h.imports.get(id, "u1"); j.err != resumeparse.ErrUnreadable {
		t.Fatalf("empty result must be unreadable, got %v", j.err)
	}
}
