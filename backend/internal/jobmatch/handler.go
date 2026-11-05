package jobmatch

import (
	"context"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"pypr/backend/internal/auth"
	"pypr/backend/internal/httpx"
	"pypr/backend/internal/jobs"
)

const analyzeTimeout = 90 * time.Second

type Handler struct {
	analyzer Analyzer // nil when AI is off
	log      *slog.Logger
	limit    *httpx.Limiter
	jobs     *jobs.Store[Requirements]
}

func NewHandler(analyzer Analyzer, log *slog.Logger) *Handler {
	return &Handler{analyzer: analyzer, log: log, limit: httpx.NewLimiter(20, time.Hour), jobs: jobs.NewStore[Requirements]()}
}

// Register adds POST /api/job-analyses (starts an analysis) and GET /api/job-analyses/{id} (polls it).
func (h *Handler) Register(mux *http.ServeMux, requireVerified func(http.Handler) http.Handler) {
	mux.Handle("POST /api/job-analyses", requireVerified(http.HandlerFunc(h.start)))
	mux.Handle("GET /api/job-analyses/{id}", requireVerified(http.HandlerFunc(h.status)))
}

func (h *Handler) start(w http.ResponseWriter, r *http.Request) {
	if h.analyzer == nil {
		httpx.WriteError(w, http.StatusServiceUnavailable, "ai_unavailable", "AI analysis isn't available right now.")
		return
	}
	user := auth.UserFrom(r.Context())
	if !h.limit.Allow(user.ID) {
		httpx.WriteError(w, http.StatusTooManyRequests, "rate_limited", "Too many AI analyses. Try again in an hour.")
		return
	}
	var in struct{ Posting string }
	if !httpx.DecodeJSON(w, r, &in) {
		return
	}
	posting := strings.TrimSpace(in.Posting)
	if len(posting) < 40 || len(posting) > MaxPostingChars {
		httpx.WriteValidation(w, map[string]string{"posting": "Paste a job posting (40 to 20,000 characters)."})
		return
	}
	id := h.jobs.Go(user.ID, func() (Requirements, error) {
		ctx, cancel := context.WithTimeout(context.Background(), analyzeTimeout)
		defer cancel()
		req, err := h.analyzer.Analyze(ctx, posting)
		if err != nil {
			h.log.Error("job analysis failed", "user", user.ID, "err", err)
			return Requirements{}, err
		}
		return Sanitize(req), nil
	})
	httpx.WriteJSON(w, http.StatusAccepted, map[string]string{"id": id})
}

// status: {"status":"pending"} while running, {"status":"done","requirements":…} when finished.
func (h *Handler) status(w http.ResponseWriter, r *http.Request) {
	j, ok := h.jobs.Get(r.PathValue("id"), auth.UserFrom(r.Context()).ID)
	switch {
	case !ok:
		httpx.WriteError(w, http.StatusNotFound, "not_found", "This analysis has expired. Run it again.")
	case !j.Done:
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "pending"})
	case j.Err != nil:
		httpx.WriteError(w, http.StatusBadGateway, "analysis_failed", "Couldn't analyze the posting right now. Try again in a minute.")
	case len(j.Result.Required)+len(j.Result.NiceToHave) == 0:
		httpx.WriteError(w, http.StatusUnprocessableEntity, "no_requirements", "We couldn't find requirements in that text.")
	default:
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"status": "done", "requirements": j.Result})
	}
}
