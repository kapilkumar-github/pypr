package server

import (
	"log/slog"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"pypr/backend/internal/admin"
	"pypr/backend/internal/auth"
	"pypr/backend/internal/codeprob"
	"pypr/backend/internal/design"
	"pypr/backend/internal/httpx"
	"pypr/backend/internal/jobmatch"
	"pypr/backend/internal/machine"
	"pypr/backend/internal/mcq"
	"pypr/backend/internal/pdf"
	"pypr/backend/internal/resume"
	"pypr/backend/internal/resumeparse"
	"pypr/backend/internal/runner"
	"pypr/backend/internal/tracker"
	"pypr/backend/internal/workspace"
)

func New(log *slog.Logger, db *pgxpool.Pool, authSvc *auth.Service, renderer pdf.Renderer, parser resumeparse.Parser, analyzer jobmatch.Analyzer, planner workspace.Planner, tutor mcq.Generator, codeRunner runner.Runner, reviewer machine.Reviewer, designAI design.Evaluator, cookieSecure bool, appURL, adminCode string, extensionIDs []string) http.Handler {
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
	auth.NewExt(db, log, extensionIDs).Register(mux, authHandler)
	resume.NewHandler(db, log, renderer, parser, appURL).Register(mux, authHandler.RequireUser, authHandler.RequireVerified)
	jobmatch.NewHandler(analyzer, log).Register(mux, authHandler.RequireVerified)
	workspace.NewHandler(db, log, planner).Register(mux, authHandler.RequireUser, authHandler.RequireVerified)
	codeprob.NewHandler(db, log, codeRunner).Register(mux, authHandler.RequireUser, authHandler.RequireVerified)
	machine.NewHandler(db, log, codeRunner, reviewer).Register(mux, authHandler.RequireUser, authHandler.RequireVerified)
	design.NewHandler(db, log, designAI).Register(mux, authHandler.RequireUser, authHandler.RequireVerified)
	tracker.NewHandler(db, log, tracker.NewFetcher(nil)).Register(mux, authHandler.RequireUser, authHandler.RequireVerified)
	mcq.NewHandler(db, log, tutor).Register(mux, authHandler.RequireUser, authHandler.RequireVerified)
	admin.NewHandler(db, log, adminCode).Register(mux)

	return httpx.Logging(log, httpx.RequireJSON(mux))
}
