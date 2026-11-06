package server

import (
	"log/slog"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"pypr/backend/internal/admin"
	"pypr/backend/internal/auth"
	"pypr/backend/internal/httpx"
	"pypr/backend/internal/jobmatch"
	"pypr/backend/internal/pdf"
	"pypr/backend/internal/resume"
	"pypr/backend/internal/resumeparse"
)

func New(log *slog.Logger, db *pgxpool.Pool, authSvc *auth.Service, renderer pdf.Renderer, parser resumeparse.Parser, analyzer jobmatch.Analyzer, cookieSecure bool, appURL, adminCode string) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		if err := db.Ping(r.Context()); err != nil {
			httpx.WriteError(w, http.StatusServiceUnavailable, "db_unavailable", "Database unavailable.")
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	authHandler := auth.NewHandler(authSvc, log, cookieSecure)
	authHandler.Register(mux)
	resume.NewHandler(db, log, renderer, parser, appURL).Register(mux, authHandler.RequireUser, authHandler.RequireVerified)
	jobmatch.NewHandler(analyzer, log).Register(mux, authHandler.RequireVerified)
	admin.NewHandler(db, log, adminCode).Register(mux)

	return httpx.Logging(log, httpx.RequireJSON(mux))
}
