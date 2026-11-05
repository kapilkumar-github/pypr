package resume

import (
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"pypr/backend/internal/auth"
	"pypr/backend/internal/httpx"
)

var slugPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$`)

// Sharing is the owner's view of a resume's public web page.
type Sharing struct {
	Public        bool   `json:"public"`
	Slug          string `json:"slug"`
	HideContact   bool   `json:"hideContact"`
	AllowDownload bool   `json:"allowDownload"`
	Indexable     bool   `json:"indexable"`
	Views         int    `json:"views"`
	Downloads     int    `json:"downloads"`
}

type sharingInput struct {
	Public        bool   `json:"public"`
	Slug          string `json:"slug"`
	HideContact   bool   `json:"hideContact"`
	AllowDownload bool   `json:"allowDownload"`
	Indexable     bool   `json:"indexable"`
}

// PublicResume is what anyone with the link gets.
type PublicResume struct {
	Title         string          `json:"title"`
	Data          json.RawMessage `json:"data"`
	AllowDownload bool            `json:"allowDownload"`
	Indexable     bool            `json:"indexable"`
}

func (h *Handler) registerSharing(mux *http.ServeMux, requireUser, requireVerified func(http.Handler) http.Handler) {
	mux.Handle("GET /api/resumes/{id}/sharing", requireUser(http.HandlerFunc(h.getSharing)))
	mux.Handle("PUT /api/resumes/{id}/sharing", requireVerified(http.HandlerFunc(h.updateSharing)))
	mux.HandleFunc("GET /api/public/resumes/{slug}", h.publicResume)
}

const sharingColumns = `public, coalesce(slug, ''), hide_contact, allow_download, indexable, views, downloads`

func scanSharing(row pgx.Row) (Sharing, error) {
	var s Sharing
	err := row.Scan(&s.Public, &s.Slug, &s.HideContact, &s.AllowDownload, &s.Indexable, &s.Views, &s.Downloads)
	return s, err
}

func (h *Handler) getSharing(w http.ResponseWriter, r *http.Request) {
	s, err := scanSharing(h.db.QueryRow(r.Context(),
		`select `+sharingColumns+` from resumes where id = $1 and user_id = $2`,
		r.PathValue("id"), auth.UserFrom(r.Context()).ID))
	if h.notFound(w, err) {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, s)
}

func (h *Handler) updateSharing(w http.ResponseWriter, r *http.Request) {
	var in sharingInput
	if !httpx.DecodeJSON(w, r, &in) {
		return
	}
	in.Slug = strings.ToLower(strings.TrimSpace(in.Slug))
	if in.Slug != "" && !slugPattern.MatchString(in.Slug) {
		httpx.WriteValidation(w, map[string]string{"slug": "Use 3–60 lowercase letters, numbers and dashes."})
		return
	}
	if in.Public && in.Slug == "" {
		httpx.WriteValidation(w, map[string]string{"slug": "Choose an address before turning on the public link."})
		return
	}
	s, err := scanSharing(h.db.QueryRow(r.Context(),
		`update resumes set public = $3, slug = nullif($4, ''), hide_contact = $5, allow_download = $6, indexable = $7
		 where id = $1 and user_id = $2
		 returning `+sharingColumns,
		r.PathValue("id"), auth.UserFrom(r.Context()).ID, in.Public, in.Slug, in.HideContact, in.AllowDownload, in.Indexable))
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		httpx.WriteValidation(w, map[string]string{"slug": "That address is taken. Try another."})
		return
	}
	if h.notFound(w, err) {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, s)
}

// publicResume serves a public resume and counts the view. Unknown and private slugs are both 404.
func (h *Handler) publicResume(w http.ResponseWriter, r *http.Request) {
	var out PublicResume
	var hideContact bool
	err := h.db.QueryRow(r.Context(),
		`update resumes set views = views + 1 where slug = $1 and public
		 returning title, data, allow_download, indexable, hide_contact`,
		strings.ToLower(r.PathValue("slug"))).
		Scan(&out.Title, &out.Data, &out.AllowDownload, &out.Indexable, &hideContact)
	if h.notFound(w, err) {
		return
	}
	if hideContact {
		stripped, err := stripContact(out.Data)
		if err != nil {
			httpx.Internal(w, h.log, err)
			return
		}
		out.Data = stripped
	}
	w.Header().Set("Cache-Control", "no-store")
	httpx.WriteJSON(w, http.StatusOK, out)
}

// contactKeys are the header details removed when the owner hides contact details.
var contactKeys = []string{"email", "phone", "location", "website", "linkedin", "github"}

// stripContact blanks the header contact details, custom links and references' contact lines.
func stripContact(data json.RawMessage) (json.RawMessage, error) {
	var doc map[string]any
	if err := json.Unmarshal(data, &doc); err != nil {
		return nil, err
	}
	if p, ok := doc["personalInfo"].(map[string]any); ok {
		for _, k := range contactKeys {
			if _, present := p[k]; present {
				p[k] = ""
			}
		}
		if _, present := p["links"]; present {
			p["links"] = []any{}
		}
	}
	if refs, ok := doc["references"].([]any); ok {
		for _, ref := range refs {
			if m, ok := ref.(map[string]any); ok {
				m["contact"] = ""
			}
		}
	}
	return json.Marshal(doc)
}
