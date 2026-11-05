package resume

import (
	"context"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"

	"pypr/backend/internal/auth"
	"pypr/backend/internal/httpx"
)

const (
	// A save more than this long after the last automatic snapshot starts a new editing session.
	sessionGap = "30 minutes"
	// Automatic snapshots are kept this long, and at most this many per resume. Named versions are kept until deleted.
	autoVersionDays = 90
	maxAutoVersions = 50
	maxLabelRunes   = 80
)

// Version is a saved copy of a resume. Label is empty for automatic editing-session snapshots.
type Version struct {
	ID        string    `json:"id"`
	Label     string    `json:"label"`
	Title     string    `json:"title"`
	CreatedAt time.Time `json:"createdAt"`
}

func (h *Handler) registerVersions(mux *http.ServeMux, requireUser, requireVerified func(http.Handler) http.Handler) {
	mux.Handle("GET /api/resumes/{id}/versions", requireUser(http.HandlerFunc(h.listVersions)))
	mux.Handle("POST /api/resumes/{id}/versions", requireVerified(http.HandlerFunc(h.createVersion)))
	mux.Handle("POST /api/resumes/{id}/versions/{vid}/restore", requireVerified(http.HandlerFunc(h.restoreVersion)))
	mux.Handle("DELETE /api/resumes/{id}/versions/{vid}", requireVerified(http.HandlerFunc(h.deleteVersion)))
}

func pruneAutoVersions(ctx context.Context, tx pgx.Tx, resumeID string) error {
	_, err := tx.Exec(ctx,
		`delete from resume_versions v
		 where v.resume_id = $1 and v.label is null
		   and (v.created_at < now() - make_interval(days => $2)
		        or v.id not in (select id from resume_versions
		                        where resume_id = $1 and label is null
		                        order by created_at desc limit $3))`,
		resumeID, autoVersionDays, maxAutoVersions)
	return err
}

func (h *Handler) listVersions(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(),
		`select v.id, coalesce(v.label, ''), v.title, v.created_at
		 from resume_versions v join resumes r on r.id = v.resume_id
		 where r.id = $1 and r.user_id = $2
		 order by v.created_at desc limit 200`,
		r.PathValue("id"), auth.UserFrom(r.Context()).ID)
	if err != nil {
		h.notFound(w, err)
		return
	}
	out, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (Version, error) {
		var v Version
		err := row.Scan(&v.ID, &v.Label, &v.Title, &v.CreatedAt)
		return v, err
	})
	if h.notFound(w, err) {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

type versionInput struct {
	Label string `json:"label"`
}

func (h *Handler) createVersion(w http.ResponseWriter, r *http.Request) {
	var in versionInput
	if !httpx.DecodeJSON(w, r, &in) {
		return
	}
	in.Label = strings.TrimSpace(in.Label)
	if in.Label == "" || utf8.RuneCountInString(in.Label) > maxLabelRunes {
		httpx.WriteValidation(w, map[string]string{"label": "Name the version (up to 80 characters)."})
		return
	}
	var v Version
	err := h.db.QueryRow(r.Context(),
		`insert into resume_versions (resume_id, label, title, data)
		 select id, $3, title, data from resumes where id = $1 and user_id = $2
		 returning id, label, title, created_at`,
		r.PathValue("id"), auth.UserFrom(r.Context()).ID, in.Label).
		Scan(&v.ID, &v.Label, &v.Title, &v.CreatedAt)
	if h.notFound(w, err) {
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, v)
}

// restoreVersion copies a version back into the resume after saving the current state as a named version.
func (h *Handler) restoreVersion(w http.ResponseWriter, r *http.Request) {
	id, userID := r.PathValue("id"), auth.UserFrom(r.Context()).ID
	var res Resume
	err := pgx.BeginFunc(r.Context(), h.db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(r.Context(),
			`insert into resume_versions (resume_id, label, title, data)
			 select id, 'Before restoring', title, data from resumes where id = $1 and user_id = $2`,
			id, userID); err != nil {
			return err
		}
		return tx.QueryRow(r.Context(),
			`update resumes r set title = v.title, data = v.data, updated_at = now()
			 from resume_versions v
			 where r.id = $1 and r.user_id = $2 and v.id = $3 and v.resume_id = r.id
			 returning r.id, r.title, r.data, r.created_at, r.updated_at`,
			id, userID, r.PathValue("vid")).
			Scan(&res.ID, &res.Title, &res.Data, &res.CreatedAt, &res.UpdatedAt)
	})
	if h.notFound(w, err) {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

func (h *Handler) deleteVersion(w http.ResponseWriter, r *http.Request) {
	tag, err := h.db.Exec(r.Context(),
		`delete from resume_versions v using resumes r
		 where v.id = $3 and v.resume_id = r.id and r.id = $1 and r.user_id = $2`,
		r.PathValue("id"), auth.UserFrom(r.Context()).ID, r.PathValue("vid"))
	if err == nil && tag.RowsAffected() == 0 {
		err = pgx.ErrNoRows
	}
	if h.notFound(w, err) {
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
