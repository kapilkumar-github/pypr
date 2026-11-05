package auth

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"pypr/backend/internal/httpx"
)

const CookieName = "pypr_session"

type Handler struct {
	svc          *Service
	log          *slog.Logger
	cookieSecure bool
	loginLimit   *httpx.Limiter
	resetLimit   *httpx.Limiter
	verifyLimit  *httpx.Limiter
}

func NewHandler(svc *Service, log *slog.Logger, cookieSecure bool) *Handler {
	return &Handler{
		svc:          svc,
		log:          log,
		cookieSecure: cookieSecure,
		loginLimit:   httpx.NewLimiter(10, 15*time.Minute),
		resetLimit:   httpx.NewLimiter(5, time.Hour),
		verifyLimit:  httpx.NewLimiter(20, time.Hour),
	}
}

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/auth/signup", h.signup)
	mux.HandleFunc("POST /api/auth/login", h.login)
	mux.HandleFunc("POST /api/auth/logout", h.logout)
	mux.HandleFunc("POST /api/auth/forgot-password", h.forgotPassword)
	mux.HandleFunc("POST /api/auth/reset-password", h.resetPassword)
	mux.Handle("GET /api/auth/me", h.RequireUser(http.HandlerFunc(h.me)))
	mux.HandleFunc("POST /api/auth/verify-email", h.verifyEmail)
	mux.Handle("POST /api/auth/resend-verification", h.RequireUser(http.HandlerFunc(h.resendVerification)))
}

type ctxKey struct{}

// UserFrom returns the authenticated user set by RequireUser.
func UserFrom(ctx context.Context) User {
	u, _ := ctx.Value(ctxKey{}).(User)
	return u
}

func (h *Handler) RequireUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie(CookieName)
		if err != nil {
			httpx.WriteError(w, http.StatusUnauthorized, "unauthenticated", "Please log in.")
			return
		}
		u, err := h.svc.Authenticate(r.Context(), c.Value)
		if errors.Is(err, ErrNotFound) {
			h.clearCookie(w)
			httpx.WriteError(w, http.StatusUnauthorized, "unauthenticated", "Please log in.")
			return
		}
		if err != nil {
			httpx.Internal(w, h.log, err)
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, u)))
	})
}

func (h *Handler) signup(w http.ResponseWriter, r *http.Request) {
	var in struct{ Name, Email, Password string }
	if !httpx.DecodeJSON(w, r, &in) {
		return
	}
	sess, err := h.svc.Signup(r.Context(), in.Name, in.Email, in.Password)
	if !h.handleErr(w, err) {
		return
	}
	h.setCookie(w, sess)
	httpx.WriteJSON(w, http.StatusCreated, sess.User)
}

func (h *Handler) login(w http.ResponseWriter, r *http.Request) {
	var in struct{ Email, Password string }
	if !httpx.DecodeJSON(w, r, &in) {
		return
	}
	if !h.loginLimit.Allow(normalizeEmail(in.Email)) {
		httpx.WriteError(w, http.StatusTooManyRequests, "rate_limited", "Too many attempts. Try again in a few minutes.")
		return
	}
	sess, err := h.svc.Login(r.Context(), in.Email, in.Password)
	if !h.handleErr(w, err) {
		return
	}
	h.setCookie(w, sess)
	httpx.WriteJSON(w, http.StatusOK, sess.User)
}

func (h *Handler) logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(CookieName); err == nil {
		if err := h.svc.Logout(r.Context(), c.Value); err != nil {
			httpx.Internal(w, h.log, err)
			return
		}
	}
	h.clearCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) me(w http.ResponseWriter, r *http.Request) {
	u := UserFrom(r.Context())
	if err := h.svc.EnsureVerificationSent(r.Context(), u); err != nil {
		h.log.Error("send verification email", "user", u.ID, "err", err)
	}
	httpx.WriteJSON(w, http.StatusOK, u)
}

// RequireVerified wraps RequireUser and also rejects users who haven't verified their email.
// Use it on every route that creates or changes data.
func (h *Handler) RequireVerified(next http.Handler) http.Handler {
	return h.RequireUser(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !UserFrom(r.Context()).EmailVerified {
			httpx.WriteError(w, http.StatusForbidden, "email_unverified", "Verify your email to create or edit resumes.")
			return
		}
		next.ServeHTTP(w, r)
	}))
}

func (h *Handler) verifyEmail(w http.ResponseWriter, r *http.Request) {
	var in struct{ Token string }
	if !httpx.DecodeJSON(w, r, &in) {
		return
	}
	err := h.svc.VerifyEmail(r.Context(), in.Token)
	if errors.Is(err, ErrInvalidToken) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid_token", "This verification link is invalid or has expired.")
		return
	}
	if !h.handleErr(w, err) {
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) resendVerification(w http.ResponseWriter, r *http.Request) {
	u := UserFrom(r.Context())
	if !h.verifyLimit.Allow(u.ID) {
		httpx.WriteError(w, http.StatusTooManyRequests, "rate_limited", "Too many emails. Try again later.")
		return
	}
	err := h.svc.ResendVerification(r.Context(), u)
	if errors.Is(err, ErrTooSoon) {
		httpx.WriteError(w, http.StatusTooManyRequests, "too_soon", "We just sent one. Check your inbox, or try again in a minute.")
		return
	}
	if !h.handleErr(w, err) {
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) forgotPassword(w http.ResponseWriter, r *http.Request) {
	var in struct{ Email string }
	if !httpx.DecodeJSON(w, r, &in) {
		return
	}
	if !h.resetLimit.Allow(normalizeEmail(in.Email)) {
		httpx.WriteError(w, http.StatusTooManyRequests, "rate_limited", "Too many requests. Try again later.")
		return
	}
	if !h.handleErr(w, h.svc.RequestPasswordReset(r.Context(), in.Email)) {
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) resetPassword(w http.ResponseWriter, r *http.Request) {
	var in struct{ Token, Password string }
	if !httpx.DecodeJSON(w, r, &in) {
		return
	}
	if !h.handleErr(w, h.svc.ResetPassword(r.Context(), in.Token, in.Password)) {
		return
	}
	h.clearCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

// handleErr writes the response for err and reports whether the caller should continue.
func (h *Handler) handleErr(w http.ResponseWriter, err error) bool {
	var ve ValidationError
	switch {
	case err == nil:
		return true
	case errors.As(err, &ve):
		httpx.WriteValidation(w, ve)
	case errors.Is(err, ErrInvalidCredentials):
		httpx.WriteError(w, http.StatusUnauthorized, "invalid_credentials", "Incorrect email or password.")
	case errors.Is(err, ErrInvalidToken):
		httpx.WriteError(w, http.StatusBadRequest, "invalid_token", "This reset link is invalid or has expired.")
	default:
		httpx.Internal(w, h.log, err)
	}
	return false
}

func (h *Handler) setCookie(w http.ResponseWriter, s Session) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    s.Token,
		Path:     "/",
		Expires:  s.ExpiresAt,
		MaxAge:   int(time.Until(s.ExpiresAt).Seconds()),
		HttpOnly: true,
		Secure:   h.cookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
}

func (h *Handler) clearCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name: CookieName, Value: "", Path: "/", MaxAge: -1,
		HttpOnly: true, Secure: h.cookieSecure, SameSite: http.SameSiteLaxMode,
	})
}
