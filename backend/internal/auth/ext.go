package auth

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"pypr/backend/internal/httpx"
)

const (
	extCodeTTL = 5 * time.Minute
	// RedirectPath is the only path an extension may be sent back to.
	extRedirectPath = "/pypr"
)

var (
	challengeRe = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)
	verifierRe  = regexp.MustCompile(`^[A-Za-z0-9._~-]{43,128}$`)
	stateRe     = regexp.MustCompile(`^[A-Za-z0-9_-]{16,128}$`)
	extIDRe     = regexp.MustCompile(`^[a-p]{32}$`)
)

// Ext connects the Pypr browser extension to an account: PKCE authorization-code exchange.
//
//  1. The extension opens the web app's /extension/connect page with state, a PKCE challenge and its redirect URI.
//  2. The signed-in user approves; the page calls POST /api/ext/authorize (cookie session) and gets a one-time code.
//  3. The extension trades code + verifier for its own session token at POST /api/ext/token.
//
// The redirect URI must be exactly https://<id>.chromiumapp.org/pypr for an allowed extension ID.
type Ext struct {
	db        *pgxpool.Pool
	log       *slog.Logger
	ids       map[string]bool
	authorize *httpx.Limiter
	exchange  *httpx.Limiter
	now       func() time.Time
}

// NewExt returns the handler for the allowed extension IDs (invalid IDs are dropped). With none, the routes answer 404.
func NewExt(db *pgxpool.Pool, log *slog.Logger, ids []string) *Ext {
	e := &Ext{db: db, log: log, ids: map[string]bool{}, authorize: httpx.NewLimiter(20, time.Hour), exchange: httpx.NewLimiter(120, time.Minute), now: time.Now}
	for _, id := range ids {
		if id = strings.TrimSpace(id); extIDRe.MatchString(id) {
			e.ids[id] = true
		}
	}
	return e
}

func (e *Ext) validRedirect(raw string) bool {
	rest, ok := strings.CutPrefix(raw, "https://")
	if !ok {
		return false
	}
	host, path, _ := strings.Cut(rest, "/")
	id, ok := strings.CutSuffix(host, ".chromiumapp.org")
	return ok && e.ids[id] && "/"+path == extRedirectPath
}

func (e *Ext) Register(mux *http.ServeMux, h *Handler) {
	mux.Handle("POST /api/ext/authorize", h.RequireUser(http.HandlerFunc(e.issue)))
	mux.HandleFunc("POST /api/ext/token", e.token)
}

func (e *Ext) issue(w http.ResponseWriter, r *http.Request) {
	// Only a signed-in web session can approve a connection. An extension token can't mint another.
	if r.Header.Get("Authorization") != "" {
		httpx.WriteError(w, http.StatusForbidden, "forbidden", "Approve from the Pypr website.")
		return
	}
	u := UserFrom(r.Context())
	var in struct {
		State       string `json:"state"`
		Challenge   string `json:"challenge"`
		RedirectURI string `json:"redirectUri"`
	}
	if !httpx.DecodeJSON(w, r, &in) {
		return
	}
	switch {
	case !stateRe.MatchString(in.State):
		httpx.WriteValidation(w, map[string]string{"state": "Invalid state."})
		return
	case !challengeRe.MatchString(in.Challenge):
		httpx.WriteValidation(w, map[string]string{"challenge": "Invalid challenge."})
		return
	case !e.validRedirect(in.RedirectURI):
		httpx.WriteError(w, http.StatusBadRequest, "bad_redirect", "This extension isn't allowed to connect.")
		return
	}
	if !e.authorize.Allow(u.ID) {
		httpx.WriteError(w, http.StatusTooManyRequests, "rate_limited", "Too many attempts. Try again later.")
		return
	}
	code, hash, err := newToken()
	if err != nil {
		httpx.Internal(w, e.log, err)
		return
	}
	_, err = e.db.Exec(r.Context(),
		`insert into extension_codes (code_hash, user_id, challenge, redirect_uri, expires_at) values ($1, $2, $3, $4, $5)`,
		hash, u.ID, in.Challenge, in.RedirectURI, e.now().Add(extCodeTTL))
	if err != nil {
		httpx.Internal(w, e.log, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]string{"code": code})
}

func (e *Ext) token(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Code        string `json:"code"`
		Verifier    string `json:"verifier"`
		RedirectURI string `json:"redirectUri"`
	}
	if !httpx.DecodeJSON(w, r, &in) {
		return
	}
	if !e.exchange.Allow("token") {
		httpx.WriteError(w, http.StatusTooManyRequests, "rate_limited", "Too many attempts. Try again later.")
		return
	}
	invalid := func() {
		httpx.WriteError(w, http.StatusBadRequest, "invalid_code", "This connection request is invalid or has expired. Start again from the extension.")
	}
	if !verifierRe.MatchString(in.Verifier) || in.Code == "" || len(in.Code) > 100 {
		invalid()
		return
	}
	var sess Session
	err := pgx.BeginFunc(r.Context(), e.db, func(tx pgx.Tx) error {
		var userID, challenge, redirect string
		// The code is spent by the first attempt, right or wrong, so a guessed verifier can't be retried.
		err := tx.QueryRow(r.Context(),
			`update extension_codes set used_at = $2 where code_hash = $1 and used_at is null and expires_at > $2
			 returning user_id, challenge, redirect_uri`, hashToken(in.Code), e.now()).Scan(&userID, &challenge, &redirect)
		if err != nil {
			return ErrInvalidToken
		}
		sum := sha256.Sum256([]byte(in.Verifier))
		got := base64.RawURLEncoding.EncodeToString(sum[:])
		if subtle.ConstantTimeCompare([]byte(got), []byte(challenge)) != 1 || in.RedirectURI != redirect {
			return errBadVerifier
		}
		token, tokenHash, err := newToken()
		if err != nil {
			return err
		}
		expires := e.now().Add(SessionTTL)
		if _, err := tx.Exec(r.Context(), `insert into sessions (token_hash, user_id, expires_at, kind) values ($1, $2, $3, 'extension')`, tokenHash, userID, expires); err != nil {
			return err
		}
		sess = Session{Token: token, ExpiresAt: expires}
		sess.User, err = scanUser(tx.QueryRow(r.Context(), `select `+userColumns+` from users u where u.id = $1`, userID))
		return err
	})
	switch {
	case errors.Is(err, errBadVerifier):
		// The transaction rolled back the spend; burn the code explicitly.
		_, _ = e.db.Exec(r.Context(), `update extension_codes set used_at = $2 where code_hash = $1 and used_at is null`, hashToken(in.Code), e.now())
		invalid()
		return
	case errors.Is(err, ErrInvalidToken):
		invalid()
		return
	case err != nil:
		httpx.Internal(w, e.log, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"token": sess.Token, "expiresAt": sess.ExpiresAt, "user": sess.User})
}

var errBadVerifier = errors.New("bad verifier")
