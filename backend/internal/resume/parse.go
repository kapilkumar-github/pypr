package resume

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"pypr/backend/internal/auth"
	"pypr/backend/internal/httpx"
	"pypr/backend/internal/resumeparse"
)

const (
	maxUploadBytes = 3 << 20
	parseTimeout   = 90 * time.Second
	// importTTL is how long a finished import waits to be collected.
	importTTL = 10 * time.Minute
)

type parseInput struct {
	FileName    string `json:"fileName"`
	ContentType string `json:"contentType"`
	Data        string `json:"data"` // base64
}

// Parsing takes up to a minute on free models, longer than proxies in front of the API keep a
// request open. So an upload starts a job and the web app polls for the result.
type importJob struct {
	userID  string
	done    bool
	result  resumeparse.Parsed
	err     error
	created time.Time
}

// importJobs is an in-memory store: jobs live in the process that runs them (single instance).
type importJobs struct {
	mu   sync.Mutex
	jobs map[string]*importJob
}

func newImportJobs() *importJobs { return &importJobs{jobs: map[string]*importJob{}} }

func (s *importJobs) start(userID string) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	for id, j := range s.jobs {
		if time.Since(j.created) > importTTL {
			delete(s.jobs, id)
		}
	}
	id := rand.Text()
	s.jobs[id] = &importJob{userID: userID, created: time.Now()}
	return id
}

func (s *importJobs) finish(id string, result resumeparse.Parsed, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if j := s.jobs[id]; j != nil {
		j.done, j.result, j.err = true, result, err
	}
}

// get returns a copy of the user's job, or false when it doesn't exist or belongs to someone else.
func (s *importJobs) get(id, userID string) (importJob, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	j := s.jobs[id]
	if j == nil || j.userID != userID {
		return importJob{}, false
	}
	return *j, true
}

// startImport validates an uploaded resume (PDF, DOCX or text) and starts extracting its fields.
// Nothing is stored: the web app maps the result and creates the resume.
func (h *Handler) startImport(w http.ResponseWriter, r *http.Request) {
	if h.parser == nil {
		httpx.WriteError(w, http.StatusServiceUnavailable, "import_unavailable", "Resume upload isn't available right now.")
		return
	}
	user := auth.UserFrom(r.Context())
	if !h.parseLimit.Allow(user.ID) {
		httpx.WriteError(w, http.StatusTooManyRequests, "rate_limited", "Too many uploads. Try again in an hour.")
		return
	}
	var in parseInput
	if !httpx.DecodeJSONLimit(w, r, &in, int64(base64.StdEncoding.EncodedLen(maxUploadBytes)+4096)) {
		return
	}
	kind := resumeparse.Kind(in.FileName, in.ContentType)
	if kind == "" {
		httpx.WriteValidation(w, map[string]string{"file": "Upload a PDF, Word (.docx) or text file."})
		return
	}
	data, err := base64.StdEncoding.DecodeString(in.Data)
	if err != nil || len(data) == 0 {
		httpx.WriteValidation(w, map[string]string{"file": "That file couldn't be read."})
		return
	}
	if len(data) > maxUploadBytes {
		httpx.WriteValidation(w, map[string]string{"file": "Upload a file under 3 MB."})
		return
	}

	id := h.imports.start(user.ID)
	doc := resumeparse.Document{Name: in.FileName, MIME: kind, Data: data}
	go h.runImport(id, user.ID, doc)
	httpx.WriteJSON(w, http.StatusAccepted, map[string]string{"id": id})
}

func (h *Handler) runImport(id, userID string, doc resumeparse.Document) {
	ctx, cancel := context.WithTimeout(context.Background(), parseTimeout)
	defer cancel()
	start := time.Now()
	parsed, err := h.parser.Parse(ctx, doc)
	if err == nil {
		parsed = resumeparse.Sanitize(parsed)
		if parsed.Empty() {
			err = resumeparse.ErrUnreadable
		}
	}
	if err != nil && !errors.Is(err, resumeparse.ErrUnreadable) {
		h.log.Error("resume parse failed", "user", userID, "kind", doc.MIME, "err", err)
	} else {
		h.log.Info("resume parsed", "user", userID, "kind", doc.MIME, "dur", time.Since(start).Round(time.Millisecond), slog.Bool("ok", err == nil))
	}
	h.imports.finish(id, parsed, err)
}

// importStatus reports a job: 200 {"status":"pending"} while running, 200 {"status":"done","resume":…}
// when finished, or the same errors the parse produced.
func (h *Handler) importStatus(w http.ResponseWriter, r *http.Request) {
	j, ok := h.imports.get(r.PathValue("id"), auth.UserFrom(r.Context()).ID)
	switch {
	case !ok:
		httpx.WriteError(w, http.StatusNotFound, "not_found", "This upload has expired. Try again.")
	case !j.done:
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "pending"})
	case j.err == nil:
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"status": "done", "resume": j.result})
	case errors.Is(j.err, resumeparse.ErrUnreadable):
		httpx.WriteError(w, http.StatusUnprocessableEntity, "unreadable", "We couldn't find resume text in that file. Scanned images aren't supported yet.")
	default:
		httpx.WriteError(w, http.StatusBadGateway, "parse_failed", "Couldn't read your resume right now. Try again in a minute.")
	}
}
