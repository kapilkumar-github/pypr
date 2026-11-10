package workspace

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"pypr/backend/internal/auth"
	"pypr/backend/internal/httpx"
	"pypr/backend/internal/jobs"
)

const planTimeout = 90 * time.Second

type Handler struct {
	db      *pgxpool.Pool
	log     *slog.Logger
	planner Planner // nil when AI is off
	limit   *httpx.Limiter
	jobs    *jobs.Store[[]ActivityInput]
}

func NewHandler(db *pgxpool.Pool, log *slog.Logger, planner Planner) *Handler {
	return &Handler{db: db, log: log, planner: planner, limit: httpx.NewLimiter(10, time.Hour), jobs: jobs.NewStore[[]ActivityInput]()}
}

// Register adds the routes. requireVerified guards every route that creates or changes data.
func (h *Handler) Register(mux *http.ServeMux, requireUser, requireVerified func(http.Handler) http.Handler) {
	read := func(pattern string, f http.HandlerFunc) { mux.Handle(pattern, requireUser(f)) }
	write := func(pattern string, f http.HandlerFunc) { mux.Handle(pattern, requireVerified(f)) }
	read("GET /api/workspaces", h.list)
	write("POST /api/workspaces", h.create)
	read("GET /api/workspaces/{id}", h.get)
	write("PUT /api/workspaces/{id}", h.update)
	write("DELETE /api/workspaces/{id}", h.delete)

	read("GET /api/workspaces/{id}/activities", h.listActivities)
	write("POST /api/workspaces/{id}/activities", h.addActivities)
	write("PUT /api/workspaces/{id}/activities/order", h.reorder)
	write("PUT /api/workspaces/{id}/activities/{aid}", h.updateActivity)
	write("DELETE /api/workspaces/{id}/activities/{aid}", h.deleteActivity)
	write("POST /api/workspaces/{id}/activities/{aid}/completions", h.addCompletion)
	write("DELETE /api/workspaces/{id}/activities/{aid}/completions/{cid}", h.removeCompletion)

	read("GET /api/workspaces/{id}/suggestions", h.suggestions)
	write("POST /api/workspaces/{id}/plan-suggestions", h.startPlan)
	write("GET /api/workspaces/{id}/plan-suggestions/{job}", h.planStatus)

	write("PUT /api/skills/{key}", h.setSkillLevel)
	read("GET /api/workspace-features", h.features)
}

func userID(r *http.Request) string { return auth.UserFrom(r.Context()).ID }

// features tells the web app which optional capabilities the API has.
func (h *Handler) features(w http.ResponseWriter, r *http.Request) {
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"aiSuggestions": h.planner != nil})
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	out, err := list(r.Context(), h.db, userID(r))
	if err != nil {
		httpx.Internal(w, h.log, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	var in input
	if !h.decodeContext(w, r, &in) {
		return
	}
	// Everything about the person is read from their resume, so a workspace needs one.
	if len(in.ResumeIDs) == 0 {
		httpx.WriteValidation(w, map[string]string{"resumeIds": "Choose or upload a resume."})
		return
	}
	var id string
	err := pgx.BeginFunc(r.Context(), h.db, func(tx pgx.Tx) error {
		var err error
		id, err = create(r.Context(), tx, userID(r), in)
		return err
	})
	if h.contextErr(w, err) {
		return
	}
	h.writeWorkspace(w, r, id, http.StatusCreated)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	h.writeWorkspace(w, r, r.PathValue("id"), http.StatusOK)
}

func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	var in input
	if !h.decodeContext(w, r, &in) {
		return
	}
	err := pgx.BeginFunc(r.Context(), h.db, func(tx pgx.Tx) error {
		return update(r.Context(), tx, userID(r), r.PathValue("id"), in)
	})
	if h.contextErr(w, err) {
		return
	}
	h.writeWorkspace(w, r, r.PathValue("id"), http.StatusOK)
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	tag, err := h.db.Exec(r.Context(), `delete from workspaces where id = $1 and user_id = $2`, r.PathValue("id"), userID(r))
	if err == nil && tag.RowsAffected() == 0 {
		err = errNotFound
	}
	if h.failed(w, err) {
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) decodeContext(w http.ResponseWriter, r *http.Request, in *input) bool {
	if !httpx.DecodeJSON(w, r, in) {
		return false
	}
	if errs := in.validate(); len(errs) > 0 {
		httpx.WriteValidation(w, errs)
		return false
	}
	return true
}

func (h *Handler) contextErr(w http.ResponseWriter, err error) bool {
	if errors.Is(err, errForeignResume) {
		httpx.WriteValidation(w, map[string]string{"resumeIds": "Choose one of your resumes."})
		return true
	}
	return h.failed(w, err)
}

func (h *Handler) writeWorkspace(w http.ResponseWriter, r *http.Request, id string, status int) {
	ws, err := Load(r.Context(), h.db, userID(r), id)
	if h.failed(w, err) {
		return
	}
	httpx.WriteJSON(w, status, ws)
}

func (h *Handler) listActivities(w http.ResponseWriter, r *http.Request) {
	if h.failed(w, owns(r.Context(), h.db, userID(r), r.PathValue("id"))) {
		return
	}
	h.writePlan(w, r)
}

func (h *Handler) writePlan(w http.ResponseWriter, r *http.Request) {
	out, err := activities(r.Context(), h.db, r.PathValue("id"))
	if err != nil {
		httpx.Internal(w, h.log, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

// planChange runs change with the workspace locked, then replies with the whole plan.
func (h *Handler) planChange(w http.ResponseWriter, r *http.Request, change func(ctx context.Context, tx pgx.Tx, workspaceID string) error) {
	err := pgx.BeginFunc(r.Context(), h.db, func(tx pgx.Tx) error {
		if err := lockWorkspace(r.Context(), tx, userID(r), r.PathValue("id")); err != nil {
			return err
		}
		return change(r.Context(), tx, r.PathValue("id"))
	})
	switch {
	case errors.Is(err, errTooMany):
		httpx.WriteError(w, http.StatusUnprocessableEntity, "too_many", "A plan can hold up to 200 activities.")
	case errors.Is(err, errOrderMismatch):
		httpx.WriteError(w, http.StatusConflict, "plan_changed", "The plan changed. Reload and try again.")
	case errors.Is(err, errNotCountable):
		httpx.WriteError(w, http.StatusUnprocessableEntity, "not_countable", "Only count activities record completions.")
	case errors.Is(err, errTargetReached):
		httpx.WriteError(w, http.StatusConflict, "target_reached", "This activity is already complete.")
	case !h.failed(w, err):
		h.writePlan(w, r)
	}
}

func (h *Handler) addActivities(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Activities []ActivityInput `json:"activities"`
	}
	if !httpx.DecodeJSON(w, r, &in) {
		return
	}
	if len(in.Activities) == 0 || len(in.Activities) > maxBatch {
		httpx.WriteError(w, http.StatusUnprocessableEntity, "validation_failed", "Add 1 to 50 activities at a time.")
		return
	}
	for i := range in.Activities {
		if errs := in.Activities[i].validate(); len(errs) > 0 {
			httpx.WriteValidation(w, errs)
			return
		}
	}
	h.planChange(w, r, func(ctx context.Context, tx pgx.Tx, id string) error {
		return addActivities(ctx, tx, id, in.Activities)
	})
}

func (h *Handler) updateActivity(w http.ResponseWriter, r *http.Request) {
	var in ActivityInput
	if !httpx.DecodeJSON(w, r, &in) {
		return
	}
	if errs := in.validate(); len(errs) > 0 {
		httpx.WriteValidation(w, errs)
		return
	}
	h.planChange(w, r, func(ctx context.Context, tx pgx.Tx, id string) error {
		return updateActivity(ctx, tx, id, r.PathValue("aid"), in)
	})
}

func (h *Handler) deleteActivity(w http.ResponseWriter, r *http.Request) {
	h.planChange(w, r, func(ctx context.Context, tx pgx.Tx, id string) error {
		tag, err := tx.Exec(ctx, `delete from prep_activities where id = $1 and workspace_id = $2`, r.PathValue("aid"), id)
		if err == nil && tag.RowsAffected() == 0 {
			err = errNotFound
		}
		return err
	})
}

func (h *Handler) reorder(w http.ResponseWriter, r *http.Request) {
	var in struct {
		IDs []string `json:"ids"`
	}
	if !httpx.DecodeJSON(w, r, &in) {
		return
	}
	for i, id := range in.IDs {
		in.IDs[i] = strings.ToLower(id)
		if !uuidPattern.MatchString(in.IDs[i]) {
			httpx.WriteError(w, http.StatusConflict, "plan_changed", "The plan changed. Reload and try again.")
			return
		}
	}
	h.planChange(w, r, func(ctx context.Context, tx pgx.Tx, id string) error {
		return reorder(ctx, tx, id, in.IDs)
	})
}

func (h *Handler) addCompletion(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Note string `json:"note"`
	}
	if !httpx.DecodeJSON(w, r, &in) {
		return
	}
	if in.Note = clean(in.Note); runes(in.Note) > 200 {
		httpx.WriteValidation(w, map[string]string{"note": "Use up to 200 characters."})
		return
	}
	h.planChange(w, r, func(ctx context.Context, tx pgx.Tx, id string) error {
		_, err := addCompletion(ctx, tx, id, r.PathValue("aid"), "manual", "", in.Note)
		return err
	})
}

func (h *Handler) removeCompletion(w http.ResponseWriter, r *http.Request) {
	h.planChange(w, r, func(ctx context.Context, tx pgx.Tx, id string) error {
		return removeCompletion(ctx, tx, id, r.PathValue("aid"), r.PathValue("cid"))
	})
}

func (h *Handler) suggestions(w http.ResponseWriter, r *http.Request) {
	ws, plan, ok := h.loadWithPlan(w, r)
	if ok {
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"activities": Suggest(ws, plan)})
	}
}

func (h *Handler) loadWithPlan(w http.ResponseWriter, r *http.Request) (Workspace, []Activity, bool) {
	ws, err := Load(r.Context(), h.db, userID(r), r.PathValue("id"))
	if h.failed(w, err) {
		return ws, nil, false
	}
	plan, err := activities(r.Context(), h.db, ws.ID)
	if err != nil {
		httpx.Internal(w, h.log, err)
		return ws, nil, false
	}
	return ws, plan, true
}

// startPlan asks the AI for suggestions as a background job the web app polls.
func (h *Handler) startPlan(w http.ResponseWriter, r *http.Request) {
	if h.planner == nil {
		httpx.WriteError(w, http.StatusServiceUnavailable, "ai_unavailable", "AI suggestions aren't available right now.")
		return
	}
	user := userID(r)
	if !h.limit.Allow(user) {
		httpx.WriteError(w, http.StatusTooManyRequests, "rate_limited", "Too many AI suggestions. Try again in an hour.")
		return
	}
	ws, plan, ok := h.loadWithPlan(w, r)
	if !ok {
		return
	}
	titles := []string{}
	for _, a := range plan {
		titles = append(titles, a.Title)
	}
	id := h.jobs.Go(user+"/"+ws.ID, func() ([]ActivityInput, error) {
		ctx, cancel := context.WithTimeout(context.Background(), planTimeout)
		defer cancel()
		planned, err := h.planner.Suggest(ctx, ws, titles)
		if err != nil {
			h.log.Error("plan suggestion failed", "user", user, "err", err)
			return nil, err
		}
		return fromPlanned(planned, ws, plan), nil
	})
	httpx.WriteJSON(w, http.StatusAccepted, map[string]string{"id": id})
}

func (h *Handler) planStatus(w http.ResponseWriter, r *http.Request) {
	j, ok := h.jobs.Get(r.PathValue("job"), userID(r)+"/"+r.PathValue("id"))
	switch {
	case !ok:
		httpx.WriteError(w, http.StatusNotFound, "not_found", "These suggestions have expired. Ask again.")
	case !j.Done:
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "pending"})
	case j.Err != nil:
		httpx.WriteError(w, http.StatusBadGateway, "suggestion_failed", "Couldn't get suggestions right now. Try again in a minute.")
	default:
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"status": "done", "activities": j.Result})
	}
}

func (h *Handler) setSkillLevel(w http.ResponseWriter, r *http.Request) {
	var in struct {
		SelfLevel string `json:"selfLevel"`
	}
	if !httpx.DecodeJSON(w, r, &in) {
		return
	}
	if !slices.Contains(levels, in.SelfLevel) {
		httpx.WriteValidation(w, map[string]string{"selfLevel": "Choose a level."})
		return
	}
	var s Skill
	err := h.db.QueryRow(r.Context(),
		`update user_skills set self_level = $3, updated_at = now() where user_id = $1 and key = $2
		 returning key, name, area, self_level, demonstrated_level`, userID(r), r.PathValue("key"), in.SelfLevel).
		Scan(&s.Key, &s.Name, &s.Area, &s.SelfLevel, &s.DemonstratedLevel)
	if h.failed(w, err) {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, s)
}

// failed writes the response for an error and reports whether there was one. Missing rows, other
// users' rows and malformed IDs are all 404.
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
