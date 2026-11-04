package resume

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"pypr/backend/internal/auth"
	"pypr/backend/internal/httpx"
)

// renderTTL bounds how long a print-page link works. Chrome opens it within a second or two.
const renderTTL = time.Minute

// renderTokens sign short-lived links that let headless Chrome load one resume's print page
// without a session. The key lives only in this process, so tokens die with a restart.
type renderTokens struct{ key []byte }

func newRenderTokens() renderTokens {
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		panic(err)
	}
	return renderTokens{key: key}
}

type renderClaim struct {
	ResumeID    string
	HideContact bool
	Expires     time.Time
}

func (t renderTokens) sign(c renderClaim) string {
	payload := fmt.Sprintf("%s|%t|%d", c.ResumeID, c.HideContact, c.Expires.Unix())
	mac := hmac.New(sha256.New, t.key)
	mac.Write([]byte(payload))
	enc := base64.RawURLEncoding
	return enc.EncodeToString([]byte(payload)) + "." + enc.EncodeToString(mac.Sum(nil))
}

func (t renderTokens) verify(token string, now time.Time) (renderClaim, bool) {
	enc := base64.RawURLEncoding
	p64, s64, ok := strings.Cut(token, ".")
	if !ok {
		return renderClaim{}, false
	}
	payload, err1 := enc.DecodeString(p64)
	sig, err2 := enc.DecodeString(s64)
	if err1 != nil || err2 != nil {
		return renderClaim{}, false
	}
	mac := hmac.New(sha256.New, t.key)
	mac.Write(payload)
	if !hmac.Equal(sig, mac.Sum(nil)) {
		return renderClaim{}, false
	}
	parts := strings.Split(string(payload), "|")
	if len(parts) != 3 {
		return renderClaim{}, false
	}
	exp, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil || now.Unix() > exp {
		return renderClaim{}, false
	}
	return renderClaim{ResumeID: parts[0], HideContact: parts[1] == "true", Expires: time.Unix(exp, 0)}, true
}

// RenderResume is what the web print page needs.
type RenderResume struct {
	Title string          `json:"title"`
	Data  json.RawMessage `json:"data"`
}

func (h *Handler) registerRender(mux *http.ServeMux, requireUser func(http.Handler) http.Handler) {
	mux.Handle("POST /api/resumes/{id}/pdf", requireUser(http.HandlerFunc(h.ownerPDF)))
	mux.HandleFunc("POST /api/public/resumes/{slug}/pdf", h.publicPDF)
	mux.HandleFunc("GET /api/render/resumes/{id}", h.renderData)
}

func (h *Handler) ownerPDF(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFrom(r.Context())
	if !h.pdfLimit.Allow("user:" + user.ID) {
		httpx.WriteError(w, http.StatusTooManyRequests, "rate_limited", "Too many downloads. Try again in a few minutes.")
		return
	}
	var id string
	err := h.db.QueryRow(r.Context(), `select id from resumes where id = $1 and user_id = $2`, r.PathValue("id"), user.ID).Scan(&id)
	if h.notFound(w, err) {
		return
	}
	h.writePDF(w, r, renderClaim{ResumeID: id})
}

// publicPDF renders a shared resume for a visitor and counts the download.
func (h *Handler) publicPDF(w http.ResponseWriter, r *http.Request) {
	slug := strings.ToLower(r.PathValue("slug"))
	if !h.pdfLimit.Allow("slug:" + slug) {
		httpx.WriteError(w, http.StatusTooManyRequests, "rate_limited", "Too many downloads. Try again in a few minutes.")
		return
	}
	var c renderClaim
	err := h.db.QueryRow(r.Context(),
		`update resumes set downloads = downloads + 1 where slug = $1 and public and allow_download
		 returning id, hide_contact`, slug).Scan(&c.ResumeID, &c.HideContact)
	if h.notFound(w, err) {
		return
	}
	h.writePDF(w, r, c)
}

func (h *Handler) writePDF(w http.ResponseWriter, r *http.Request, c renderClaim) {
	c.Expires = time.Now().Add(renderTTL)
	link := fmt.Sprintf("%s/print/%s?token=%s", h.appURL, url.PathEscape(c.ResumeID), url.QueryEscape(h.tokens.sign(c)))
	out, err := h.pdf.Render(r.Context(), link)
	if err != nil {
		h.log.Error("pdf render failed", "resume", c.ResumeID, "err", err)
		httpx.WriteError(w, http.StatusBadGateway, "pdf_failed", "Couldn't create the PDF. Try again.")
		return
	}
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", `attachment; filename="resume.pdf"`)
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Length", strconv.Itoa(len(out)))
	_, _ = w.Write(out)
}

// renderData serves one resume to the print page that headless Chrome opens. The token is the only credential.
func (h *Handler) renderData(w http.ResponseWriter, r *http.Request) {
	c, ok := h.tokens.verify(r.URL.Query().Get("token"), time.Now())
	if !ok || c.ResumeID != r.PathValue("id") {
		httpx.WriteError(w, http.StatusNotFound, "not_found", "Resume not found.")
		return
	}
	var out RenderResume
	err := h.db.QueryRow(r.Context(), `select title, data from resumes where id = $1`, c.ResumeID).Scan(&out.Title, &out.Data)
	if h.notFound(w, err) {
		return
	}
	if c.HideContact {
		if out.Data, err = stripContact(out.Data); err != nil {
			httpx.Internal(w, h.log, err)
			return
		}
	}
	w.Header().Set("Cache-Control", "no-store")
	httpx.WriteJSON(w, http.StatusOK, out)
}
