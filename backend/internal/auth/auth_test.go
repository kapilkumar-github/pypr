package auth

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"pypr/backend/internal/email"
	"pypr/backend/internal/httpx"
)

func TestPasswordHashRoundTrip(t *testing.T) {
	h, err := HashPassword("correct horse")
	if err != nil {
		t.Fatal(err)
	}
	if ok, _ := VerifyPassword("correct horse", h); !ok {
		t.Fatal("expected match")
	}
	if ok, _ := VerifyPassword("wrong", h); ok {
		t.Fatal("expected mismatch")
	}
	if _, err := VerifyPassword("x", "garbage"); err == nil {
		t.Fatal("expected malformed hash error")
	}
}

func newTestService(t *testing.T) (*Service, *memStore, *email.Fake) {
	t.Helper()
	store, mail := newMemStore(), &email.Fake{}
	svc, err := NewService(store, mail, "http://app.test/")
	if err != nil {
		t.Fatal(err)
	}
	return svc, store, mail
}

func TestSignupValidation(t *testing.T) {
	svc, _, _ := newTestService(t)
	_, err := svc.Signup(context.Background(), " ", "not-an-email", "short")
	var ve ValidationError
	if !errors.As(err, &ve) {
		t.Fatalf("want ValidationError, got %v", err)
	}
	for _, f := range []string{"name", "email", "password"} {
		if ve[f] == "" {
			t.Errorf("missing error for %s", f)
		}
	}
}

func TestSignupLoginLogout(t *testing.T) {
	ctx := context.Background()
	svc, _, _ := newTestService(t)

	s, err := svc.Signup(ctx, "Ada", "  Ada@Example.com ", "password123")
	if err != nil {
		t.Fatal(err)
	}
	if s.User.Email != "ada@example.com" {
		t.Fatalf("email not normalized: %q", s.User.Email)
	}
	if _, err := svc.Signup(ctx, "Ada", "ada@example.com", "password123"); !errors.As(err, new(ValidationError)) {
		t.Fatalf("duplicate email should be a validation error, got %v", err)
	}
	if _, err := svc.Login(ctx, "ada@example.com", "wrong-pass"); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("want invalid credentials, got %v", err)
	}
	if _, err := svc.Login(ctx, "nobody@example.com", "password123"); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("unknown email must look identical, got %v", err)
	}
	l, err := svc.Login(ctx, "ADA@example.com", "password123")
	if err != nil {
		t.Fatal(err)
	}
	if u, err := svc.Authenticate(ctx, l.Token); err != nil || u.ID != s.User.ID {
		t.Fatalf("authenticate: %v %v", u, err)
	}
	if err := svc.Logout(ctx, l.Token); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Authenticate(ctx, l.Token); !errors.Is(err, ErrNotFound) {
		t.Fatal("session should be gone after logout")
	}
}

func TestSessionExpiry(t *testing.T) {
	ctx := context.Background()
	svc, _, _ := newTestService(t)
	s, _ := svc.Signup(ctx, "Ada", "ada@example.com", "password123")
	svc.now = func() time.Time { return time.Now().Add(SessionTTL + time.Minute) }
	if _, err := svc.Authenticate(ctx, s.Token); !errors.Is(err, ErrNotFound) {
		t.Fatal("expired session must not authenticate")
	}
}

func resetTokenFrom(t *testing.T, m email.Message) string {
	t.Helper()
	i := strings.Index(m.Text, "http://app.test/reset-password?token=")
	if i < 0 {
		t.Fatalf("no reset link in %q", m.Text)
	}
	link := strings.Fields(m.Text[i:])[0]
	u, _ := url.Parse(link)
	return u.Query().Get("token")
}

func TestPasswordReset(t *testing.T) {
	ctx := context.Background()
	svc, _, mail := newTestService(t)
	s, _ := svc.Signup(ctx, "Ada", "ada@example.com", "password123")

	if err := svc.RequestPasswordReset(ctx, "unknown@example.com"); err != nil {
		t.Fatalf("unknown email must succeed silently: %v", err)
	}
	if len(mail.Sent) != 0 {
		t.Fatal("no email for unknown address")
	}
	if err := svc.RequestPasswordReset(ctx, "ada@example.com"); err != nil {
		t.Fatal(err)
	}
	msg, _ := mail.Last()
	token := resetTokenFrom(t, msg)

	if err := svc.ResetPassword(ctx, token, "short"); !errors.As(err, new(ValidationError)) {
		t.Fatalf("want validation error, got %v", err)
	}
	if err := svc.ResetPassword(ctx, token, "new-password-1"); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Authenticate(ctx, s.Token); !errors.Is(err, ErrNotFound) {
		t.Fatal("existing sessions must be revoked after reset")
	}
	if err := svc.ResetPassword(ctx, token, "another-pass-2"); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("token must be single use, got %v", err)
	}
	if _, err := svc.Login(ctx, "ada@example.com", "new-password-1"); err != nil {
		t.Fatalf("login with new password: %v", err)
	}
}

func TestResetTokenExpiry(t *testing.T) {
	ctx := context.Background()
	svc, _, mail := newTestService(t)
	svc.Signup(ctx, "Ada", "ada@example.com", "password123")
	svc.RequestPasswordReset(ctx, "ada@example.com")
	msg, _ := mail.Last()
	svc.now = func() time.Time { return time.Now().Add(ResetTTL + time.Minute) }
	if err := svc.ResetPassword(ctx, resetTokenFrom(t, msg), "new-password-1"); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("expired token must fail, got %v", err)
	}
}

func TestHTTPFlow(t *testing.T) {
	svc, _, _ := newTestService(t)
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	mux := http.NewServeMux()
	NewHandler(svc, log, true).Register(mux)
	srv := httptest.NewServer(httpx.RequireJSON(mux))
	defer srv.Close()

	post := func(path, body string, cookie *http.Cookie) *http.Response {
		req, _ := http.NewRequest(http.MethodPost, srv.URL+path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		if cookie != nil {
			req.AddCookie(cookie)
		}
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		return res
	}

	// Form-encoded (CSRF-able) requests are rejected.
	res, _ := http.Post(srv.URL+"/api/auth/login", "application/x-www-form-urlencoded", strings.NewReader("email=a"))
	if res.StatusCode != http.StatusUnsupportedMediaType {
		t.Fatalf("form post: got %d", res.StatusCode)
	}

	res = post("/api/auth/signup", `{"name":"Ada","email":"ada@example.com","password":"short"}`, nil)
	if res.StatusCode != http.StatusUnprocessableEntity {
		t.Fatalf("signup validation: got %d", res.StatusCode)
	}
	var body struct {
		Error httpx.APIError `json:"error"`
	}
	json.NewDecoder(res.Body).Decode(&body)
	if body.Error.Fields["password"] == "" {
		t.Fatalf("expected password field error: %+v", body)
	}

	res = post("/api/auth/signup", `{"name":"Ada","email":"ada@example.com","password":"password123"}`, nil)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("signup: got %d", res.StatusCode)
	}
	var cookie *http.Cookie
	for _, c := range res.Cookies() {
		if c.Name == CookieName {
			cookie = c
		}
	}
	if cookie == nil || !cookie.HttpOnly || !cookie.Secure || cookie.SameSite != http.SameSiteLaxMode {
		t.Fatalf("bad session cookie: %+v", cookie)
	}

	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/auth/me", nil)
	req.AddCookie(cookie)
	res, _ = http.DefaultClient.Do(req)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("me: got %d", res.StatusCode)
	}

	res = post("/api/auth/logout", `{}`, cookie)
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("logout: got %d", res.StatusCode)
	}
	res, _ = http.DefaultClient.Do(req)
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("me after logout: got %d", res.StatusCode)
	}

	for i := 0; i < 10; i++ {
		post("/api/auth/login", `{"email":"ada@example.com","password":"bad-password"}`, nil)
	}
	res = post("/api/auth/login", `{"email":"ada@example.com","password":"password123"}`, nil)
	if res.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("login rate limit: got %d", res.StatusCode)
	}
}
