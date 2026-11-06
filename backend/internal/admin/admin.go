// Package admin serves monitoring stats behind a shared code from the environment.
package admin

import (
	"crypto/subtle"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"pypr/backend/internal/httpx"
)

type Handler struct {
	db    *pgxpool.Pool
	log   *slog.Logger
	code  string
	limit *httpx.Limiter
}

func NewHandler(db *pgxpool.Pool, log *slog.Logger, code string) *Handler {
	return &Handler{db: db, log: log, code: code, limit: httpx.NewLimiter(10, 15*time.Minute)}
}

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/admin/stats", h.stats)
}

// authorized reports whether the request carries the admin code. An unset code disables the endpoint.
func (h *Handler) authorized(r *http.Request) bool {
	if h.code == "" {
		return false
	}
	got := r.Header.Get("X-Admin-Code")
	return subtle.ConstantTimeCompare([]byte(got), []byte(h.code)) == 1
}

func (h *Handler) stats(w http.ResponseWriter, r *http.Request) {
	if !h.limit.Allow(clientIP(r)) {
		httpx.WriteError(w, http.StatusTooManyRequests, "rate_limited", "Too many attempts. Try again later.")
		return
	}
	if !h.authorized(r) {
		httpx.WriteError(w, http.StatusUnauthorized, "invalid_code", "Invalid code.")
		return
	}
	s, err := h.load(r)
	if err != nil {
		httpx.Internal(w, h.log, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, s)
}

func clientIP(r *http.Request) string {
	if v := r.Header.Get("CF-Connecting-IP"); v != "" {
		return v
	}
	if v := r.Header.Get("X-Forwarded-For"); v != "" {
		return strings.TrimSpace(strings.Split(v, ",")[0])
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
