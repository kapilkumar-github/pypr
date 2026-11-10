// Package design stores system design (HLD) boards: a canvas of shapes and components per workspace.
// The API keeps the canvas document opaque (the web app owns its shape) and only bounds its size.
package design

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"pypr/backend/internal/auth"
	"pypr/backend/internal/httpx"
)

const (
	maxDocBytes  = 1 << 20
	maxBoards    = 50
	maxTitleLen  = 120
	maxPromptKey = 60
	maxNotes     = 30
)

type Handler struct {
	db  *pgxpool.Pool
	log *slog.Logger
	// ai is the interviewer. Nil when AI is off: evaluation and chat then answer 503.
	ai    Evaluator
	evals *httpx.Limiter
	chats *httpx.Limiter
}

func NewHandler(db *pgxpool.Pool, log *slog.Logger, ai Evaluator) *Handler {
	return &Handler{db: db, log: log, ai: ai, evals: httpx.NewLimiter(10, time.Hour), chats: httpx.NewLimiter(60, time.Hour)}
}

func (h *Handler) Register(mux *http.ServeMux, requireUser, requireVerified func(http.Handler) http.Handler) {
	const base = "/api/workspaces/{id}/design/boards"
	mux.Handle("GET "+base, requireUser(http.HandlerFunc(h.list)))
	mux.Handle("POST "+base, requireVerified(http.HandlerFunc(h.create)))
	mux.Handle("GET "+base+"/{bid}", requireUser(http.HandlerFunc(h.get)))
	mux.Handle("PUT "+base+"/{bid}", requireVerified(http.HandlerFunc(h.save)))
	mux.Handle("DELETE "+base+"/{bid}", requireVerified(http.HandlerFunc(h.remove)))
	mux.Handle("GET "+base+"/{bid}/messages", requireUser(http.HandlerFunc(h.messages)))
	mux.Handle("POST "+base+"/{bid}/evaluate", requireVerified(http.HandlerFunc(h.evaluate)))
	mux.Handle("POST "+base+"/{bid}/chat", requireVerified(http.HandlerFunc(h.chat)))
}

type Summary struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	PromptKey *string   `json:"promptKey"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type Board struct {
	Summary
	Doc json.RawMessage `json:"doc"`
}

func isNotFound(err error) bool {
	var pgErr *pgconn.PgError
	return errors.Is(err, pgx.ErrNoRows) || (errors.As(err, &pgErr) && pgErr.Code == "22P02")
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
	var x int
	err := h.db.QueryRow(r.Context(), `select 1 from workspaces where id = $1 and user_id = $2`, id, auth.UserFrom(r.Context()).ID).Scan(&x)
	return id, !h.failed(w, err)
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	ws, ok := h.workspace(w, r)
	if !ok {
		return
	}
	rows, err := h.db.Query(r.Context(), `select id, title, prompt_key, updated_at from design_boards where workspace_id = $1 order by updated_at desc`, ws)
	if h.failed(w, err) {
		return
	}
	out, err := pgx.CollectRows(rows, pgx.RowToStructByPos[Summary])
	if h.failed(w, err) {
		return
	}
	if out == nil {
		out = []Summary{}
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

type createInput struct {
	Title     string          `json:"title"`
	PromptKey string          `json:"promptKey"`
	Doc       json.RawMessage `json:"doc"`
}

func validTitle(title string) (string, bool) {
	title = strings.TrimSpace(title)
	return title, title != "" && len([]rune(title)) <= maxTitleLen
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	ws, ok := h.workspace(w, r)
	if !ok {
		return
	}
	var in createInput
	if !httpx.DecodeJSONLimit(w, r, &in, maxDocBytes+4096) {
		return
	}
	title, ok := validTitle(in.Title)
	if !ok || len(in.PromptKey) > maxPromptKey {
		httpx.WriteValidation(w, map[string]string{"title": "Give the board a title (120 characters at most)."})
		return
	}
	doc := in.Doc
	if len(doc) == 0 {
		doc = json.RawMessage(`{"nodes":[],"edges":[]}`)
	}
	if !validDoc(doc) {
		httpx.WriteValidation(w, map[string]string{"doc": "The diagram is invalid or too large (1 MB at most)."})
		return
	}
	var n int
	if h.failed(w, h.db.QueryRow(r.Context(), `select count(*) from design_boards where workspace_id = $1`, ws).Scan(&n)) {
		return
	}
	if n >= maxBoards {
		httpx.WriteValidation(w, map[string]string{"title": "A workspace holds up to 50 boards. Delete one first."})
		return
	}
	var s Summary
	err := h.db.QueryRow(r.Context(),
		`insert into design_boards (workspace_id, title, prompt_key, doc) values ($1, $2, nullif($3, ''), $4) returning id, title, prompt_key, updated_at`,
		ws, title, in.PromptKey, []byte(doc)).Scan(&s.ID, &s.Title, &s.PromptKey, &s.UpdatedAt)
	if h.failed(w, err) {
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, s)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	ws, ok := h.workspace(w, r)
	if !ok {
		return
	}
	var b Board
	var doc []byte
	err := h.db.QueryRow(r.Context(), `select id, title, prompt_key, updated_at, doc from design_boards where id = $1 and workspace_id = $2`, r.PathValue("bid"), ws).
		Scan(&b.ID, &b.Title, &b.PromptKey, &b.UpdatedAt, &doc)
	if h.failed(w, err) {
		return
	}
	b.Doc = doc
	httpx.WriteJSON(w, http.StatusOK, b)
}

type saveInput struct {
	Title string          `json:"title"`
	Doc   json.RawMessage `json:"doc"`
}

// save replaces the title and the document. The last write wins: a board is edited in one tab at a time.
func (h *Handler) save(w http.ResponseWriter, r *http.Request) {
	ws, ok := h.workspace(w, r)
	if !ok {
		return
	}
	var in saveInput
	if !httpx.DecodeJSONLimit(w, r, &in, maxDocBytes+4096) {
		return
	}
	title, ok := validTitle(in.Title)
	if !ok {
		httpx.WriteValidation(w, map[string]string{"title": "Give the board a title (120 characters at most)."})
		return
	}
	if !validDoc(in.Doc) {
		httpx.WriteValidation(w, map[string]string{"doc": "The diagram is invalid or too large (1 MB at most)."})
		return
	}
	var at time.Time
	err := h.db.QueryRow(r.Context(), `update design_boards set title = $3, doc = $4, updated_at = now() where id = $1 and workspace_id = $2 returning updated_at`,
		r.PathValue("bid"), ws, title, []byte(in.Doc)).Scan(&at)
	if h.failed(w, err) {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]time.Time{"updatedAt": at})
}

func (h *Handler) remove(w http.ResponseWriter, r *http.Request) {
	ws, ok := h.workspace(w, r)
	if !ok {
		return
	}
	tag, err := h.db.Exec(r.Context(), `delete from design_boards where id = $1 and workspace_id = $2`, r.PathValue("bid"), ws)
	if h.failed(w, err) {
		return
	}
	if tag.RowsAffected() == 0 {
		httpx.WriteError(w, http.StatusNotFound, "not_found", "Not found.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// validDoc accepts a JSON object under the size limit with "nodes" and "edges" arrays.
func validDoc(doc json.RawMessage) bool {
	if len(doc) == 0 || len(doc) > maxDocBytes {
		return false
	}
	var d struct {
		Nodes []json.RawMessage `json:"nodes"`
		Edges []json.RawMessage `json:"edges"`
		Notes []json.RawMessage `json:"notes"`
	}
	if json.Unmarshal(doc, &d) != nil || d.Nodes == nil || d.Edges == nil {
		return false
	}
	return len(d.Nodes) <= 2000 && len(d.Edges) <= 4000 && len(d.Notes) <= maxNotes
}
