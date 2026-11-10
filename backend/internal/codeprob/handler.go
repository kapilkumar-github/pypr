package codeprob

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"pypr/backend/internal/auth"
	"pypr/backend/internal/httpx"
	"pypr/backend/internal/runner"
)

const maxSourceBytes = 64 * 1024

type Handler struct {
	db  *pgxpool.Pool
	log *slog.Logger
	// runner runs code on the server. Nil when the code runner is off.
	runner runner.Runner
	runs   *httpx.Limiter
	// busy limits how many batches the code runner works on at once.
	busy chan struct{}
}

func NewHandler(db *pgxpool.Pool, log *slog.Logger, runner runner.Runner) *Handler {
	return &Handler{db: db, log: log, runner: runner, runs: httpx.NewLimiter(60, 10*time.Minute), busy: make(chan struct{}, 4)}
}

// Register adds the routes. Everything is scoped to a workspace the caller owns.
func (h *Handler) Register(mux *http.ServeMux, requireUser, requireVerified func(http.Handler) http.Handler) {
	mux.Handle("GET /api/workspaces/{id}/code/problems", requireUser(http.HandlerFunc(h.list)))
	mux.Handle("GET /api/workspaces/{id}/code/problems/{pid}", requireUser(http.HandlerFunc(h.get)))
	mux.Handle("GET /api/workspaces/{id}/code/problems/{pid}/solution", requireUser(http.HandlerFunc(h.solution)))
	mux.Handle("POST /api/workspaces/{id}/code/problems/{pid}/attempts", requireVerified(http.HandlerFunc(h.attempt)))
	mux.Handle("POST /api/workspaces/{id}/code/problems/{pid}/judge", requireVerified(http.HandlerFunc(h.judge)))
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

func (h *Handler) owned(w http.ResponseWriter, r *http.Request) (string, bool) {
	id := r.PathValue("id")
	if h.failed(w, ownsWorkspace(r.Context(), h.db, auth.UserFrom(r.Context()).ID, id)) {
		return "", false
	}
	return id, true
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	id, ok := h.owned(w, r)
	if !ok {
		return
	}
	kind := r.URL.Query().Get("kind")
	if kind != "" && kind != KindMachine && kind != KindDSA {
		httpx.WriteValidation(w, map[string]string{"kind": "Unknown kind."})
		return
	}
	out, err := list(r.Context(), h.db, id, r.URL.Query().Get("topic"), kind)
	if h.failed(w, err) {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	id, ok := h.owned(w, r)
	if !ok {
		return
	}
	p, err := get(r.Context(), h.db, id, r.PathValue("pid"))
	if h.failed(w, err) {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, p)
}

func (h *Handler) attempt(w http.ResponseWriter, r *http.Request) {
	id, ok := h.owned(w, r)
	if !ok {
		return
	}
	var in AttemptInput
	if !httpx.DecodeJSON(w, r, &in) {
		return
	}
	if errs := in.validate(); len(errs) > 0 {
		httpx.WriteValidation(w, errs)
		return
	}
	err := addAttempt(r.Context(), h.db, id, r.PathValue("pid"), in)
	if errors.Is(err, errServerScored) {
		httpx.WriteValidation(w, map[string]string{"total": "This problem is checked on the server. Use Submit."})
		return
	}
	if errors.Is(err, errBadAttempt) {
		httpx.WriteValidation(w, map[string]string{"total": "The result doesn't match this problem's tests."})
		return
	}
	if h.failed(w, err) {
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) solution(w http.ResponseWriter, r *http.Request) {
	id, ok := h.owned(w, r)
	if !ok {
		return
	}
	f, err := solution(r.Context(), h.db, id, r.PathValue("pid"))
	if errors.Is(err, errNoAttempt) {
		httpx.WriteError(w, http.StatusForbidden, "no_attempt", "Try the problem first. The solution unlocks after your first submit.")
		return
	}
	if h.failed(w, err) {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, f)
}

type judgeInput struct {
	Language string `json:"language"`
	Source   string `json:"source"`
	Submit   bool   `json:"submit"`
}

// judge runs the learner's code on the server. Submit checks every test and stores the attempt, scored here.
func (h *Handler) judge(w http.ResponseWriter, r *http.Request) {
	id, ok := h.owned(w, r)
	if !ok {
		return
	}
	var in judgeInput
	if !httpx.DecodeJSON(w, r, &in) {
		return
	}
	if strings.TrimSpace(in.Source) == "" || len(in.Source) > maxSourceBytes {
		httpx.WriteValidation(w, map[string]string{"source": "Write some code first (64 KB at most)."})
		return
	}
	pid := r.PathValue("pid")
	stored, err := loadStored(r.Context(), h.db, pid)
	if h.failed(w, err) {
		return
	}
	if stored.Runner != RunnerServer || !slices.Contains(languagesFor(stored.Language), in.Language) {
		httpx.WriteValidation(w, map[string]string{"language": "This language isn't available for this problem."})
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
	out, err := Judge(r.Context(), h.runner, stored, in.Language, in.Source, in.Submit)
	if errors.Is(err, runner.ErrUnavailable) || errors.Is(err, context.DeadlineExceeded) {
		h.log.Error("code runner", "err", err)
		httpx.WriteError(w, http.StatusServiceUnavailable, "runner_off", "The code runner didn't answer. Try again.")
		return
	}
	if h.failed(w, err) {
		return
	}
	if in.Submit {
		err := insertAttempt(r.Context(), h.db, id, pid, Files{in.Language: in.Source}, in.Language, out.Passed, out.Total)
		if h.failed(w, err) {
			return
		}
	}
	httpx.WriteJSON(w, http.StatusOK, out.Redact())
}

func loadStored(ctx context.Context, db DB, id string) (Stored, error) {
	var s Stored
	var tests []byte
	if err := db.QueryRow(ctx, `select runner, language, tests from code_problems where id = $1`, id).Scan(&s.Runner, &s.Language, &tests); err != nil {
		return s, err
	}
	return s, json.Unmarshal(tests, &s.Tests)
}
