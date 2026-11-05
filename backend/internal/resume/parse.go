package resume

import (
	"context"
	"encoding/base64"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"pypr/backend/internal/auth"
	"pypr/backend/internal/httpx"
	"pypr/backend/internal/resumeparse"
)

const (
	maxUploadBytes = 3 << 20
	parseTimeout   = 90 * time.Second
)

type parseInput struct {
	FileName    string `json:"fileName"`
	ContentType string `json:"contentType"`
	Data        string `json:"data"` // base64
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

	doc := resumeparse.Document{Name: in.FileName, MIME: kind, Data: data}
	id := h.imports.Go(user.ID, func() (resumeparse.Parsed, error) { return h.runImport(user.ID, doc) })
	httpx.WriteJSON(w, http.StatusAccepted, map[string]string{"id": id})
}

// runImport parses doc in the background; slow free models are why it isn't done in the request.
func (h *Handler) runImport(userID string, doc resumeparse.Document) (resumeparse.Parsed, error) {
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
	return parsed, err
}

// importStatus reports a job: 200 {"status":"pending"} while running, 200 {"status":"done","resume":…}
// when finished, or the same errors the parse produced.
func (h *Handler) importStatus(w http.ResponseWriter, r *http.Request) {
	j, ok := h.imports.Get(r.PathValue("id"), auth.UserFrom(r.Context()).ID)
	switch {
	case !ok:
		httpx.WriteError(w, http.StatusNotFound, "not_found", "This upload has expired. Try again.")
	case !j.Done:
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "pending"})
	case j.Err == nil:
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"status": "done", "resume": j.Result})
	case errors.Is(j.Err, resumeparse.ErrUnreadable):
		httpx.WriteError(w, http.StatusUnprocessableEntity, "unreadable", "We couldn't find resume text in that file. Scanned images aren't supported yet.")
	default:
		httpx.WriteError(w, http.StatusBadGateway, "parse_failed", "Couldn't read your resume right now. Try again in a minute.")
	}
}
