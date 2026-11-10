package tracker

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"pypr/backend/internal/auth"
	"pypr/backend/internal/httpx"
)

const (
	defaultPage = 100
	maxPage     = 200
)

type Handler struct {
	db           *pgxpool.Pool
	log          *slog.Logger
	fetcher      *Fetcher
	extractLimit *httpx.Limiter
}

// NewHandler wires the job tracker API. fetcher reads job pages for URL extraction.
func NewHandler(db *pgxpool.Pool, log *slog.Logger, fetcher *Fetcher) *Handler {
	return &Handler{db: db, log: log, fetcher: fetcher, extractLimit: httpx.NewLimiter(30, time.Hour)}
}

// Register adds the routes. requireVerified guards every route that creates or changes data.
func (h *Handler) Register(mux *http.ServeMux, requireUser, requireVerified func(http.Handler) http.Handler) {
	read := func(pattern string, f http.HandlerFunc) { mux.Handle(pattern, requireUser(f)) }
	write := func(pattern string, f http.HandlerFunc) { mux.Handle(pattern, requireVerified(f)) }
	read("GET /api/tracked-jobs", h.list)
	write("POST /api/tracked-jobs", h.create)
	write("POST /api/tracked-jobs/duplicates", h.duplicates)
	write("POST /api/job-extractions", h.extract)
	read("GET /api/tracked-jobs/{id}", h.get)
	write("PUT /api/tracked-jobs/{id}", h.update)
	write("DELETE /api/tracked-jobs/{id}", h.delete)
	write("PUT /api/tracked-jobs/{id}/status", h.status)
	write("POST /api/tracked-jobs/{id}/apply", h.apply)
	write("POST /api/tracked-jobs/{id}/resumes", h.attachResume)
	read("GET /api/tracked-jobs/{id}/resumes/{sid}", h.snapshot)
	write("PUT /api/tracked-jobs/{id}/next-action", h.nextAction)
	write("POST /api/tracked-jobs/{id}/notes", h.addNote)
	write("PUT /api/tracked-jobs/{id}/notes/{nid}", h.updateNote)
	write("DELETE /api/tracked-jobs/{id}/notes/{nid}", h.deleteNote)
	write("POST /api/tracked-jobs/{id}/interviews", h.addInterview)
	write("PUT /api/tracked-jobs/{id}/interviews/{iid}", h.updateInterview)
	write("DELETE /api/tracked-jobs/{id}/interviews/{iid}", h.deleteInterview)
}

func userID(r *http.Request) string { return auth.UserFrom(r.Context()).ID }

// failed writes the response for err and reports whether one was written.
func (h *Handler) failed(w http.ResponseWriter, err error) bool {
	switch {
	case err == nil:
		return false
	case isNotFound(err):
		httpx.WriteError(w, http.StatusNotFound, "not_found", "Job not found.")
	case errors.Is(err, errForeignResume):
		httpx.WriteValidation(w, map[string]string{"resumeId": "Choose one of your resumes."})
	case errors.Is(err, errNeedsConfirmation):
		httpx.WriteError(w, http.StatusConflict, "apply_confirmation_required",
			"Confirm the application to mark this job as applied.")
	case errors.Is(err, errAlreadySubmitted):
		httpx.WriteError(w, http.StatusConflict, "already_applied",
			"The submitted application is already recorded. Add a resume as added later instead.")
	case errors.Is(err, errNotApplied):
		httpx.WriteError(w, http.StatusConflict, "not_applied", "Confirm the application first.")
	case errors.Is(err, errAppliedAtRequired):
		httpx.WriteValidation(w, map[string]string{"appliedAt": "The applied date can be corrected but not removed."})
	default:
		httpx.Internal(w, h.log, err)
	}
	return true
}

func multi(r *http.Request, key string, allowed []string) []string {
	var out []string
	for _, v := range r.URL.Query()[key] {
		for _, s := range strings.Split(v, ",") {
			if slices.Contains(allowed, s) && !slices.Contains(out, s) {
				out = append(out, s)
			}
		}
	}
	return out
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	lq := ListQuery{
		Search:      q.Get("q"),
		Statuses:    multi(r, "status", Statuses),
		Sources:     multi(r, "source", sources),
		Arrangement: multi(r, "arrangement", arrangements),
		Sort:        q.Get("sort"),
		Limit:       defaultPage,
	}
	if len([]rune(lq.Search)) > 200 {
		httpx.WriteValidation(w, map[string]string{"q": "Search is limited to 200 characters."})
		return
	}
	if v := q.Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > maxPage {
			httpx.WriteValidation(w, map[string]string{"limit": "Use a limit from 1 to 200."})
			return
		}
		lq.Limit = n
	}
	if v := q.Get("offset"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 0 || n > 1_000_000 {
			httpx.WriteValidation(w, map[string]string{"offset": "Use a valid offset."})
			return
		}
		lq.Offset = n
	}
	p, err := listJobs(r.Context(), h.db, userID(r), lq)
	if h.failed(w, err) {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, p)
}

func (h *Handler) writeDetail(w http.ResponseWriter, r *http.Request, id string, status int) {
	d, err := loadDetail(r.Context(), h.db, userID(r), id)
	if h.failed(w, err) {
		return
	}
	httpx.WriteJSON(w, status, d)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	h.writeDetail(w, r, r.PathValue("id"), http.StatusOK)
}

// change runs fn in a transaction, then replies with the job's detail.
func (h *Handler) change(w http.ResponseWriter, r *http.Request, fn func(ctx context.Context, tx pgx.Tx) error) {
	err := pgx.BeginFunc(r.Context(), h.db, func(tx pgx.Tx) error { return fn(r.Context(), tx) })
	if h.failed(w, err) {
		return
	}
	h.writeDetail(w, r, r.PathValue("id"), http.StatusOK)
}

func decode[T any](w http.ResponseWriter, r *http.Request, in *T, validate func() map[string]string) bool {
	if !httpx.DecodeJSON(w, r, in) {
		return false
	}
	if errs := validate(); len(errs) > 0 {
		httpx.WriteValidation(w, errs)
		return false
	}
	return true
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	var in JobInput
	if !decode(w, r, &in, in.validate) {
		return
	}
	if in.AppliedAt != nil {
		httpx.WriteValidation(w, map[string]string{"appliedAt": "Save the job first, then confirm the application."})
		return
	}
	if key := r.Header.Get("Idempotency-Key"); key != "" {
		if !idempotencyKeyRe.MatchString(key) {
			httpx.WriteValidation(w, map[string]string{"idempotencyKey": "Use 8 to 100 letters, digits, - or _."})
			return
		}
		in.ClientKey = key
		// A retry of a save that already went through returns that job.
		if id, err := h.jobByKey(r.Context(), userID(r), key); err == nil {
			h.writeDetail(w, r, id, http.StatusOK)
			return
		} else if !errors.Is(err, pgx.ErrNoRows) {
			h.failed(w, err)
			return
		}
	}
	var id string
	err := pgx.BeginFunc(r.Context(), h.db, func(tx pgx.Tx) error {
		var err error
		id, err = createJob(r.Context(), tx, userID(r), in)
		return err
	})
	var pgErr *pgconn.PgError
	if in.ClientKey != "" && errors.As(err, &pgErr) && pgErr.Code == "23505" {
		// Two requests with the same key raced; the other one won.
		if id, err = h.jobByKey(r.Context(), userID(r), in.ClientKey); err == nil {
			h.writeDetail(w, r, id, http.StatusOK)
			return
		}
	}
	if h.failed(w, err) {
		return
	}
	h.writeDetail(w, r, id, http.StatusCreated)
}

var idempotencyKeyRe = regexp.MustCompile(`^[A-Za-z0-9_-]{8,100}$`)

func (h *Handler) jobByKey(ctx context.Context, user, key string) (string, error) {
	var id string
	err := h.db.QueryRow(ctx, `select id from tracked_jobs where user_id = $1 and client_key = $2`, user, key).Scan(&id)
	return id, err
}

func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	var in JobInput
	if !decode(w, r, &in, in.validate) {
		return
	}
	if in.Note != "" {
		httpx.WriteValidation(w, map[string]string{"note": "Add notes from the job's notes."})
		return
	}
	h.change(w, r, func(ctx context.Context, tx pgx.Tx) error {
		return updateJob(ctx, tx, userID(r), r.PathValue("id"), in)
	})
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	tag, err := h.db.Exec(r.Context(), `delete from tracked_jobs where id = $1 and user_id = $2`, r.PathValue("id"), userID(r))
	if err == nil && tag.RowsAffected() == 0 {
		err = errNotFound
	}
	if h.failed(w, err) {
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) status(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Status string `json:"status"`
	}
	if !decode(w, r, &in, func() map[string]string {
		if !slices.Contains(Statuses, in.Status) {
			return map[string]string{"status": "Choose a status from the list."}
		}
		return nil
	}) {
		return
	}
	h.change(w, r, func(ctx context.Context, tx pgx.Tx) error {
		return setStatus(ctx, tx, userID(r), r.PathValue("id"), in.Status)
	})
}

func (h *Handler) apply(w http.ResponseWriter, r *http.Request) {
	var in ApplyInput
	if !decode(w, r, &in, func() map[string]string {
		if errs := in.Resume.validate(); errs != nil {
			return errs
		}
		if in.AppliedAt != nil && in.AppliedAt.After(time.Now().Add(24*time.Hour)) {
			return map[string]string{"appliedAt": "The applied date can't be in the future."}
		}
		return nil
	}) {
		return
	}
	h.change(w, r, func(ctx context.Context, tx pgx.Tx) error {
		return confirmApply(ctx, tx, userID(r), r.PathValue("id"), in)
	})
}

func (h *Handler) attachResume(w http.ResponseWriter, r *http.Request) {
	var in ResumeChoice
	if !decode(w, r, &in, in.validate) {
		return
	}
	h.change(w, r, func(ctx context.Context, tx pgx.Tx) error {
		return attachResume(ctx, tx, userID(r), r.PathValue("id"), in)
	})
}

func (h *Handler) snapshot(w http.ResponseWriter, r *http.Request) {
	s, err := snapshot(r.Context(), h.db, userID(r), r.PathValue("id"), r.PathValue("sid"))
	if h.failed(w, err) {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, s)
}

func (h *Handler) nextAction(w http.ResponseWriter, r *http.Request) {
	var in NextActionInput
	if !decode(w, r, &in, in.validate) {
		return
	}
	h.change(w, r, func(ctx context.Context, tx pgx.Tx) error {
		return setNextAction(ctx, tx, userID(r), r.PathValue("id"), in)
	})
}

type noteInput struct {
	Body string `json:"body"`
}

func (in *noteInput) validate() map[string]string {
	var errs map[string]string
	in.Body, errs = validateNote(in.Body)
	return errs
}

// child runs a change to one of the job's rows with the job locked. A row of another job, or of
// another user's job, counts as not found.
func (h *Handler) child(w http.ResponseWriter, r *http.Request, sql string, args ...any) {
	h.change(w, r, func(ctx context.Context, tx pgx.Tx) error {
		if _, _, err := lockJob(ctx, tx, userID(r), r.PathValue("id")); err != nil {
			return err
		}
		tag, err := tx.Exec(ctx, sql, append([]any{r.PathValue("id")}, args...)...)
		if err == nil && tag.RowsAffected() == 0 {
			return errNotFound
		}
		if err != nil {
			return err
		}
		return touch(ctx, tx, r.PathValue("id"))
	})
}

func (h *Handler) addNote(w http.ResponseWriter, r *http.Request) {
	var in noteInput
	if !decode(w, r, &in, in.validate) {
		return
	}
	h.child(w, r, `insert into job_notes (job_id, body) values ($1, $2)`, in.Body)
}

func (h *Handler) updateNote(w http.ResponseWriter, r *http.Request) {
	var in noteInput
	if !decode(w, r, &in, in.validate) {
		return
	}
	h.child(w, r, `update job_notes set body = $3, updated_at = now() where job_id = $1 and id = $2`, r.PathValue("nid"), in.Body)
}

func (h *Handler) deleteNote(w http.ResponseWriter, r *http.Request) {
	h.child(w, r, `delete from job_notes where job_id = $1 and id = $2`, r.PathValue("nid"))
}

func (h *Handler) addInterview(w http.ResponseWriter, r *http.Request) {
	var in InterviewInput
	if !decode(w, r, &in, in.validate) {
		return
	}
	h.child(w, r,
		`insert into job_interviews (job_id, round, scheduled_at, timezone, meeting_url, notes) values ($1, $2, $3, $4, $5, $6)`,
		in.Round, in.ScheduledAt, in.Timezone, in.MeetingURL, in.Notes)
}

func (h *Handler) updateInterview(w http.ResponseWriter, r *http.Request) {
	var in InterviewInput
	if !decode(w, r, &in, in.validate) {
		return
	}
	h.child(w, r,
		`update job_interviews set round = $3, scheduled_at = $4, timezone = $5, meeting_url = $6, notes = $7, updated_at = now()
		 where job_id = $1 and id = $2`,
		r.PathValue("iid"), in.Round, in.ScheduledAt, in.Timezone, in.MeetingURL, in.Notes)
}

func (h *Handler) deleteInterview(w http.ResponseWriter, r *http.Request) {
	h.child(w, r, `delete from job_interviews where job_id = $1 and id = $2`, r.PathValue("iid"))
}

func (h *Handler) duplicates(w http.ResponseWriter, r *http.Request) {
	var q DuplicateQuery
	if !httpx.DecodeJSON(w, r, &q) {
		return
	}
	q.Company, q.Title = cleanLine(q.Company), cleanLine(q.Title)
	if q.ExcludeID != "" && !isUUID(q.ExcludeID) {
		q.ExcludeID = ""
	}
	out, err := findDuplicates(r.Context(), h.db, userID(r), q)
	if h.failed(w, err) {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"duplicates": out})
}

func (h *Handler) extract(w http.ResponseWriter, r *http.Request) {
	var in struct {
		URL string `json:"url"`
	}
	if !httpx.DecodeJSON(w, r, &in) {
		return
	}
	in.URL = strings.TrimSpace(in.URL)
	if !validURL(in.URL) {
		httpx.WriteValidation(w, map[string]string{"url": "Enter a full web address starting with https://."})
		return
	}
	if !h.extractLimit.Allow(userID(r)) {
		httpx.WriteError(w, http.StatusTooManyRequests, "rate_limited", "Too many job links read. Try again later or enter the details by hand.")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, h.fetcher.Extract(r.Context(), in.URL))
}

func isUUID(s string) bool {
	if len(s) != 36 {
		return false
	}
	for i, c := range s {
		switch {
		case i == 8 || i == 13 || i == 18 || i == 23:
			if c != '-' {
				return false
			}
		case !strings.ContainsRune("0123456789abcdefABCDEF", c):
			return false
		}
	}
	return true
}
