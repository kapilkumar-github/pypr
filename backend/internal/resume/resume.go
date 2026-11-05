package resume

import (
	"bytes"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"pypr/backend/internal/auth"
	"pypr/backend/internal/httpx"
	"pypr/backend/internal/pdf"
	"pypr/backend/internal/resumeparse"
)

const maxDataBytes = 512 << 10

// Resume content is owned by the web app's editor; the API stores it as an opaque JSON object.
type Resume struct {
	ID        string          `json:"id"`
	Title     string          `json:"title"`
	Data      json.RawMessage `json:"data"`
	CreatedAt time.Time       `json:"createdAt"`
	UpdatedAt time.Time       `json:"updatedAt"`
}

// Summary is a list row. Data is included so the list can render thumbnails.
type Summary struct {
	ID        string          `json:"id"`
	Title     string          `json:"title"`
	JobTitle  string          `json:"jobTitle"`
	Template  string          `json:"template"`
	Data      json.RawMessage `json:"data"`
	CreatedAt time.Time       `json:"createdAt"`
	UpdatedAt time.Time       `json:"updatedAt"`
}

type input struct {
	Title string          `json:"title"`
	Data  json.RawMessage `json:"data"`
}

func (in *input) validate() map[string]string {
	errs := map[string]string{}
	in.Title = strings.TrimSpace(in.Title)
	if in.Title == "" || utf8.RuneCountInString(in.Title) > 200 {
		errs["title"] = "Enter a title (up to 200 characters)."
	}
	d := bytes.TrimSpace(in.Data)
	switch {
	case len(d) == 0 || d[0] != '{' || !json.Valid(d):
		errs["data"] = "Resume data must be a JSON object."
	case len(d) > maxDataBytes:
		errs["data"] = "Resume is too large."
	}
	return errs
}

type Handler struct {
	db       *pgxpool.Pool
	log      *slog.Logger
	pdf      pdf.Renderer
	appURL   string
	tokens   renderTokens
	pdfLimit *httpx.Limiter
	// parser is nil when resume upload isn't configured.
	parser     resumeparse.Parser
	parseLimit *httpx.Limiter
}

// NewHandler wires the resume API. appURL is the web app that serves the print page Chrome renders.
func NewHandler(db *pgxpool.Pool, log *slog.Logger, renderer pdf.Renderer, parser resumeparse.Parser, appURL string) *Handler {
	return &Handler{
		db:         db,
		log:        log,
		pdf:        renderer,
		appURL:     strings.TrimRight(appURL, "/"),
		tokens:     newRenderTokens(),
		pdfLimit:   httpx.NewLimiter(30, 10*time.Minute),
		parser:     parser,
		parseLimit: httpx.NewLimiter(10, time.Hour),
	}
}

// Register adds the routes. requireVerified guards every route that creates or changes data.
func (h *Handler) Register(mux *http.ServeMux, requireUser, requireVerified func(http.Handler) http.Handler) {
	mux.Handle("GET /api/resumes", requireUser(http.HandlerFunc(h.list)))
	mux.Handle("POST /api/resumes", requireVerified(http.HandlerFunc(h.create)))
	mux.Handle("POST /api/resumes/parse", requireVerified(http.HandlerFunc(h.parseUpload)))
	mux.Handle("GET /api/resumes/{id}", requireUser(http.HandlerFunc(h.get)))
	mux.Handle("PUT /api/resumes/{id}", requireVerified(http.HandlerFunc(h.update)))
	mux.Handle("DELETE /api/resumes/{id}", requireVerified(http.HandlerFunc(h.delete)))
	h.registerVersions(mux, requireUser, requireVerified)
	h.registerSharing(mux, requireUser, requireVerified)
	h.registerRender(mux, requireUser)
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(),
		`select id, title, coalesce(data->'personalInfo'->>'jobTitle', ''), coalesce(data->'settings'->>'template', ''),
		        data, created_at, updated_at
		 from resumes where user_id = $1 order by updated_at desc`, auth.UserFrom(r.Context()).ID)
	if err != nil {
		httpx.Internal(w, h.log, err)
		return
	}
	out, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (Summary, error) {
		var s Summary
		err := row.Scan(&s.ID, &s.Title, &s.JobTitle, &s.Template, &s.Data, &s.CreatedAt, &s.UpdatedAt)
		return s, err
	})
	if err != nil {
		httpx.Internal(w, h.log, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	var in input
	if !httpx.DecodeJSON(w, r, &in) {
		return
	}
	if errs := in.validate(); len(errs) > 0 {
		httpx.WriteValidation(w, errs)
		return
	}
	var res Resume
	err := h.db.QueryRow(r.Context(),
		`insert into resumes (user_id, title, data) values ($1, $2, $3)
		 returning id, title, data, created_at, updated_at`,
		auth.UserFrom(r.Context()).ID, in.Title, in.Data).
		Scan(&res.ID, &res.Title, &res.Data, &res.CreatedAt, &res.UpdatedAt)
	if err != nil {
		httpx.Internal(w, h.log, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, res)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	var res Resume
	err := h.db.QueryRow(r.Context(),
		`select id, title, data, created_at, updated_at from resumes where id = $1 and user_id = $2`,
		r.PathValue("id"), auth.UserFrom(r.Context()).ID).
		Scan(&res.ID, &res.Title, &res.Data, &res.CreatedAt, &res.UpdatedAt)
	if h.notFound(w, err) {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	var in input
	if !httpx.DecodeJSON(w, r, &in) {
		return
	}
	if errs := in.validate(); len(errs) > 0 {
		httpx.WriteValidation(w, errs)
		return
	}
	var res Resume
	err := pgx.BeginFunc(r.Context(), h.db, func(tx pgx.Tx) error {
		// The first save of an editing session snapshots the previous state, so history can restore it.
		if _, err := tx.Exec(r.Context(),
			`insert into resume_versions (resume_id, title, data)
			 select r.id, r.title, r.data from resumes r
			 where r.id = $1 and r.user_id = $2
			   and not exists (select 1 from resume_versions v
			                   where v.resume_id = r.id and v.label is null and v.created_at > now() - $3::interval)`,
			r.PathValue("id"), auth.UserFrom(r.Context()).ID, sessionGap); err != nil {
			return err
		}
		if err := tx.QueryRow(r.Context(),
			`update resumes set title = $3, data = $4, updated_at = now()
			 where id = $1 and user_id = $2
			 returning id, title, data, created_at, updated_at`,
			r.PathValue("id"), auth.UserFrom(r.Context()).ID, in.Title, in.Data).
			Scan(&res.ID, &res.Title, &res.Data, &res.CreatedAt, &res.UpdatedAt); err != nil {
			return err
		}
		return pruneAutoVersions(r.Context(), tx, res.ID)
	})
	if h.notFound(w, err) {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	tag, err := h.db.Exec(r.Context(), `delete from resumes where id = $1 and user_id = $2`,
		r.PathValue("id"), auth.UserFrom(r.Context()).ID)
	if err == nil && tag.RowsAffected() == 0 {
		err = pgx.ErrNoRows
	}
	if h.notFound(w, err) {
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// notFound writes the response for a failed lookup and reports whether one was written.
// Malformed UUIDs are treated as not found so IDs of other users are indistinguishable from missing ones.
func (h *Handler) notFound(w http.ResponseWriter, err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, pgx.ErrNoRows) || isInvalidUUID(err) {
		httpx.WriteError(w, http.StatusNotFound, "not_found", "Resume not found.")
		return true
	}
	httpx.Internal(w, h.log, err)
	return true
}
