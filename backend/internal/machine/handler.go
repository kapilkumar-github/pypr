package machine

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"slices"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"pypr/backend/internal/auth"
	"pypr/backend/internal/httpx"
	"pypr/backend/internal/runner"
)

type Handler struct {
	db       *pgxpool.Pool
	log      *slog.Logger
	runner   runner.Runner // nil when the code runner is off
	reviewer Reviewer      // nil when AI is off
	runs     *httpx.Limiter
	reviews  *httpx.Limiter
	busy     chan struct{}
}

func NewHandler(db *pgxpool.Pool, log *slog.Logger, r runner.Runner, reviewer Reviewer) *Handler {
	return &Handler{
		db: db, log: log, runner: r, reviewer: reviewer,
		runs: httpx.NewLimiter(60, 10*time.Minute), reviews: httpx.NewLimiter(10, time.Hour), busy: make(chan struct{}, 4),
	}
}

func (h *Handler) Register(mux *http.ServeMux, requireUser, requireVerified func(http.Handler) http.Handler) {
	const base = "/api/workspaces/{id}/machine"
	mux.Handle("GET "+base+"/problems", requireUser(http.HandlerFunc(h.list)))
	mux.Handle("POST "+base+"/problems/{pid}/sessions", requireVerified(http.HandlerFunc(h.start)))
	mux.Handle("GET "+base+"/sessions/{sid}", requireUser(http.HandlerFunc(h.session)))
	mux.Handle("POST "+base+"/sessions/{sid}/judge", requireVerified(http.HandlerFunc(h.judge)))
	mux.Handle("POST "+base+"/sessions/{sid}/finish", requireVerified(http.HandlerFunc(h.finish)))
	mux.Handle("GET "+base+"/sessions/{sid}/hints", requireUser(http.HandlerFunc(h.hints)))
	mux.Handle("GET "+base+"/sessions/{sid}/solution", requireUser(http.HandlerFunc(h.solution)))
	mux.Handle("POST "+base+"/sessions/{sid}/review", requireVerified(http.HandlerFunc(h.review)))
	mux.Handle("GET "+base+"/sessions/{sid}/review", requireUser(http.HandlerFunc(h.lastReview)))
}

func (h *Handler) failed(w http.ResponseWriter, err error) bool {
	if err == nil {
		return false
	}
	if isNotFound(err) {
		httpx.WriteError(w, http.StatusNotFound, "not_found", "Not found.")
		return true
	}
	httpx.Internal(w, h.log, err)
	return true
}

func (h *Handler) workspace(w http.ResponseWriter, r *http.Request) (string, bool) {
	id := r.PathValue("id")
	if h.failed(w, ownsWorkspace(r.Context(), h.db, auth.UserFrom(r.Context()).ID, id)) {
		return "", false
	}
	return id, true
}

// open loads the session and its problem for a request on /sessions/{sid}.
func (h *Handler) open(w http.ResponseWriter, r *http.Request) (Session, Problem, bool) {
	s, err := ownedSession(r.Context(), h.db, auth.UserFrom(r.Context()).ID, r.PathValue("id"), r.PathValue("sid"))
	if h.failed(w, err) {
		return s, Problem{}, false
	}
	p, err := loadProblem(r.Context(), h.db, s.ProblemID)
	if h.failed(w, err) {
		return s, p, false
	}
	return s, p, true
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	id, ok := h.workspace(w, r)
	if !ok {
		return
	}
	cat := r.URL.Query().Get("category")
	if cat != "" && !slices.Contains(Categories, cat) {
		httpx.WriteValidation(w, map[string]string{"category": "Unknown category."})
		return
	}
	out, err := list(r.Context(), h.db, id, cat)
	if h.failed(w, err) {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

type startInput struct {
	Mode    string `json:"mode"`
	Minutes int    `json:"minutes"`
}

func (h *Handler) start(w http.ResponseWriter, r *http.Request) {
	id, ok := h.workspace(w, r)
	if !ok {
		return
	}
	var in startInput
	if !httpx.DecodeJSON(w, r, &in) {
		return
	}
	if !slices.Contains([]string{ModePractice, ModeInterview, ModeReview}, in.Mode) {
		httpx.WriteValidation(w, map[string]string{"mode": "Choose practice, interview or review."})
		return
	}
	p, err := loadProblem(r.Context(), h.db, r.PathValue("pid"))
	if h.failed(w, err) {
		return
	}
	minutes := p.DurationMinutes
	if in.Minutes != 0 {
		if in.Minutes < 15 || in.Minutes > 180 {
			httpx.WriteValidation(w, map[string]string{"minutes": "Choose 15 to 180 minutes."})
			return
		}
		minutes = in.Minutes
	}
	s, err := startSession(r.Context(), h.db, id, p, in.Mode, minutes)
	if errors.Is(err, errNoAttempt) {
		httpx.WriteValidation(w, map[string]string{"mode": "Review needs an earlier attempt. Practice this problem first."})
		return
	}
	if h.failed(w, err) {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, s)
}

func (h *Handler) session(w http.ResponseWriter, r *http.Request) {
	s, p, ok := h.open(w, r)
	if !ok {
		return
	}
	src, err := currentSource(r.Context(), h.db, s, p)
	if h.failed(w, err) {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, view(s, p, src))
}

type judgeInput struct {
	Stage  int    `json:"stage"`
	Source string `json:"source"`
	Submit bool   `json:"submit"`
}

func (h *Handler) judge(w http.ResponseWriter, r *http.Request) {
	s, p, ok := h.open(w, r)
	if !ok {
		return
	}
	var in judgeInput
	if !httpx.DecodeJSON(w, r, &in) {
		return
	}
	if trim(in.Source) == "" || len(in.Source) > maxSourceBytes {
		httpx.WriteValidation(w, map[string]string{"source": "Write some code first (64 KB at most)."})
		return
	}
	if s.FinishedAt != nil && s.Mode != ModeReview {
		httpx.WriteError(w, http.StatusForbidden, "finished", "This session is over.")
		return
	}
	if in.Stage < 1 || in.Stage > unlocked(s, p) {
		httpx.WriteValidation(w, map[string]string{"stage": "That stage isn't unlocked yet."})
		return
	}
	if h.runner == nil {
		httpx.WriteError(w, http.StatusServiceUnavailable, "runner_off", "The code runner is offline. Try again later.")
		return
	}
	if !h.runs.Allow(auth.UserFrom(r.Context()).ID) {
		httpx.WriteError(w, http.StatusTooManyRequests, "rate_limited", "You are running code too fast. Wait a few minutes.")
		return
	}
	select {
	case h.busy <- struct{}{}:
		defer func() { <-h.busy }()
	case <-r.Context().Done():
		return
	}
	res, err := judge(r.Context(), h.runner, p, in.Stage, in.Source, in.Submit)
	if errors.Is(err, runner.ErrUnavailable) || errors.Is(err, context.DeadlineExceeded) {
		h.log.Error("code runner", "err", err)
		httpx.WriteError(w, http.StatusServiceUnavailable, "runner_off", "The code runner didn't answer. Try again.")
		return
	}
	if h.failed(w, err) {
		return
	}
	res.StageReached = s.StageReached
	if in.Submit {
		if h.failed(w, recordAttempt(r.Context(), h.db, s, in.Stage, in.Source, res.Passed, res.Total, res.Cleared)) {
			return
		}
		if res.Cleared && in.Stage > res.StageReached {
			res.StageReached = in.Stage
		}
		// An interview ends when its last stage is cleared.
		if s.Mode == ModeInterview && res.Cleared && in.Stage == len(p.Stages) {
			if h.failed(w, finish(r.Context(), h.db, s.ID)) {
				return
			}
		}
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

func (h *Handler) finish(w http.ResponseWriter, r *http.Request) {
	s, _, ok := h.open(w, r)
	if !ok {
		return
	}
	if h.failed(w, finish(r.Context(), h.db, s.ID)) {
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) hints(w http.ResponseWriter, r *http.Request) {
	s, p, ok := h.open(w, r)
	if !ok {
		return
	}
	if s.Mode != ModePractice {
		httpx.WriteError(w, http.StatusForbidden, "no_hints", "Hints are off in this mode.")
		return
	}
	st, found := stageOf(p, stageParam(r.URL.Query().Get("stage")))
	if !found || st.N > unlocked(s, p) {
		httpx.WriteValidation(w, map[string]string{"stage": "That stage isn't unlocked yet."})
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"hints": st.Hints})
}

func (h *Handler) solution(w http.ResponseWriter, r *http.Request) {
	s, p, ok := h.open(w, r)
	if !ok {
		return
	}
	n := stageParam(r.URL.Query().Get("stage"))
	if _, found := stageOf(p, n); !found {
		httpx.WriteValidation(w, map[string]string{"stage": "Unknown stage."})
		return
	}
	var allowed bool
	var err error
	switch s.Mode {
	case ModePractice:
		allowed, err = hasAttempt(r.Context(), h.db, s.ID, n)
	case ModeInterview:
		allowed = s.FinishedAt != nil
	default:
		allowed = true
	}
	if h.failed(w, err) {
		return
	}
	if !allowed {
		httpx.WriteError(w, http.StatusForbidden, "locked", "The solution unlocks after you submit this stage (practice) or finish the interview.")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]string{"source": p.Solutions[fmt.Sprint(n)]})
}

func (h *Handler) review(w http.ResponseWriter, r *http.Request) {
	s, p, ok := h.open(w, r)
	if !ok {
		return
	}
	if s.Mode == ModeInterview && s.FinishedAt == nil {
		httpx.WriteError(w, http.StatusForbidden, "locked", "Finish the interview to get a review.")
		return
	}
	a, err := latestAttempt(r.Context(), h.db, s.WorkspaceID, p.ID)
	if errors.Is(err, errNoAttempt) {
		httpx.WriteValidation(w, map[string]string{"session": "Submit your code first."})
		return
	}
	if h.failed(w, err) {
		return
	}
	if h.reviewer == nil {
		httpx.WriteError(w, http.StatusServiceUnavailable, "ai_off", "Reviews are offline. Try again later.")
		return
	}
	if !h.reviews.Allow(auth.UserFrom(r.Context()).ID) {
		httpx.WriteError(w, http.StatusTooManyRequests, "rate_limited", "You asked for many reviews. Try again in an hour.")
		return
	}
	reached := s.StageReached
	if a.Passed == a.Total {
		reached = max(reached, a.Stage)
	}
	res, err := h.reviewer.Review(r.Context(), ReviewInput{
		Title: p.Title, Statement: p.Statement, Requirements: p.Requirements, Criteria: p.Evaluation, Source: a.Source,
		StageReached: reached, Stages: len(p.Stages),
		Tests: []string{fmt.Sprintf("Last submit at stage %d passed %d of %d tests.", a.Stage, a.Passed, a.Total)},
	})
	if err != nil {
		h.log.Error("review", "err", err)
		httpx.WriteError(w, http.StatusBadGateway, "ai_failed", "The review didn't work. Try again.")
		return
	}
	body, _ := json.Marshal(res)
	if _, err := h.db.Exec(r.Context(), `insert into mc_reviews (session_id, attempt_id, result) values ($1, $2, $3)`, s.ID, a.ID, body); h.failed(w, err) {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

func (h *Handler) lastReview(w http.ResponseWriter, r *http.Request) {
	s, _, ok := h.open(w, r)
	if !ok {
		return
	}
	var raw []byte
	err := h.db.QueryRow(r.Context(), `select result from mc_reviews where session_id = $1 order by created_at desc limit 1`, s.ID).Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) {
		httpx.WriteJSON(w, http.StatusOK, nil)
		return
	}
	if h.failed(w, err) {
		return
	}
	var res ReviewResult
	_ = json.Unmarshal(raw, &res)
	httpx.WriteJSON(w, http.StatusOK, res)
}
