package resume

import (
	"context"
	"encoding/base64"
	"errors"
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

// parseUpload reads an uploaded resume (PDF, DOCX or text) and returns structured fields.
// It doesn't store anything: the web app maps the result and creates the resume.
func (h *Handler) parseUpload(w http.ResponseWriter, r *http.Request) {
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

	// Free models can take a while; allow more than the server's default write timeout.
	_ = http.NewResponseController(w).SetWriteDeadline(time.Now().Add(parseTimeout + 10*time.Second))
	ctx, cancel := context.WithTimeout(r.Context(), parseTimeout)
	defer cancel()
	parsed, err := h.parser.Parse(ctx, resumeparse.Document{Name: in.FileName, MIME: kind, Data: data})
	if err == nil {
		parsed = resumeparse.Sanitize(parsed)
		if parsed.Empty() {
			err = resumeparse.ErrUnreadable
		}
	}
	switch {
	case err == nil:
		httpx.WriteJSON(w, http.StatusOK, parsed)
	case errors.Is(err, resumeparse.ErrUnreadable):
		httpx.WriteError(w, http.StatusUnprocessableEntity, "unreadable", "We couldn't find resume text in that file. Scanned images aren't supported yet.")
	default:
		h.log.Error("resume parse failed", "user", user.ID, "kind", kind, "err", err)
		httpx.WriteError(w, http.StatusBadGateway, "parse_failed", "Couldn't read your resume right now. Try again in a minute.")
	}
}
