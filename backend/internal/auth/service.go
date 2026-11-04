package auth

import (
	"context"
	"errors"
	"fmt"
	"net/mail"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"pypr/backend/internal/email"
)

const (
	SessionTTL = 30 * 24 * time.Hour
	ResetTTL   = time.Hour
)

var (
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrInvalidToken       = errors.New("invalid or expired token")
)

// ValidationError maps field names to user-facing messages.
type ValidationError map[string]string

func (v ValidationError) Error() string { return "validation failed" }

type Service struct {
	store     Store
	mail      email.Sender
	appURL    string
	now       func() time.Time
	dummyHash string
}

func NewService(store Store, mail email.Sender, appURL string) (*Service, error) {
	dummy, err := HashPassword("dummy-password-for-timing")
	if err != nil {
		return nil, err
	}
	return &Service{store: store, mail: mail, appURL: strings.TrimRight(appURL, "/"), now: time.Now, dummyHash: dummy}, nil
}

type Session struct {
	User      User
	Token     string
	ExpiresAt time.Time
}

func (s *Service) Signup(ctx context.Context, name, emailAddr, password string) (Session, error) {
	name = strings.TrimSpace(name)
	emailAddr = normalizeEmail(emailAddr)
	errs := ValidationError{}
	if name == "" || utf8.RuneCountInString(name) > 100 {
		errs["name"] = "Enter your name (up to 100 characters)."
	}
	if !validEmail(emailAddr) {
		errs["email"] = "Enter a valid email address."
	}
	if msg := passwordProblem(password); msg != "" {
		errs["password"] = msg
	}
	if len(errs) > 0 {
		return Session{}, errs
	}
	hash, err := HashPassword(password)
	if err != nil {
		return Session{}, err
	}
	u, err := s.store.CreateUser(ctx, name, emailAddr, hash)
	if errors.Is(err, ErrEmailTaken) {
		return Session{}, ValidationError{"email": "An account with this email already exists."}
	}
	if err != nil {
		return Session{}, err
	}
	return s.startSession(ctx, u)
}

func (s *Service) Login(ctx context.Context, emailAddr, password string) (Session, error) {
	u, hash, err := s.store.UserByEmail(ctx, normalizeEmail(emailAddr))
	if errors.Is(err, ErrNotFound) {
		_, _ = VerifyPassword(password, s.dummyHash) // equalize timing with the found-user path
		return Session{}, ErrInvalidCredentials
	}
	if err != nil {
		return Session{}, err
	}
	ok, err := VerifyPassword(password, hash)
	if err != nil {
		return Session{}, err
	}
	if !ok {
		return Session{}, ErrInvalidCredentials
	}
	return s.startSession(ctx, u)
}

func (s *Service) Logout(ctx context.Context, token string) error {
	return s.store.DeleteSession(ctx, hashToken(token))
}

func (s *Service) Authenticate(ctx context.Context, token string) (User, error) {
	if token == "" {
		return User{}, ErrNotFound
	}
	return s.store.UserBySession(ctx, hashToken(token), s.now())
}

// RequestPasswordReset never reveals whether the email exists.
func (s *Service) RequestPasswordReset(ctx context.Context, emailAddr string) error {
	emailAddr = normalizeEmail(emailAddr)
	if !validEmail(emailAddr) {
		return ValidationError{"email": "Enter a valid email address."}
	}
	u, _, err := s.store.UserByEmail(ctx, emailAddr)
	if errors.Is(err, ErrNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	token, hash, err := newToken()
	if err != nil {
		return err
	}
	if err := s.store.CreatePasswordReset(ctx, u.ID, hash, s.now().Add(ResetTTL)); err != nil {
		return err
	}
	link := s.appURL + "/reset-password?token=" + url.QueryEscape(token)
	return s.mail.Send(ctx, email.Message{
		To:      u.Email,
		Subject: "Reset your pypr password",
		Text: fmt.Sprintf("Hi %s,\n\nUse this link to choose a new password. It expires in 1 hour.\n\n%s\n\n"+
			"If you didn't ask for this, you can ignore this email.", u.Name, link),
	})
}

func (s *Service) ResetPassword(ctx context.Context, token, password string) error {
	if msg := passwordProblem(password); msg != "" {
		return ValidationError{"password": msg}
	}
	hash, err := HashPassword(password)
	if err != nil {
		return err
	}
	err = s.store.ResetPassword(ctx, hashToken(token), s.now(), hash)
	if errors.Is(err, ErrNotFound) {
		return ErrInvalidToken
	}
	return err
}

func (s *Service) startSession(ctx context.Context, u User) (Session, error) {
	token, hash, err := newToken()
	if err != nil {
		return Session{}, err
	}
	expires := s.now().Add(SessionTTL)
	if err := s.store.CreateSession(ctx, u.ID, hash, expires); err != nil {
		return Session{}, err
	}
	return Session{User: u, Token: token, ExpiresAt: expires}, nil
}

func normalizeEmail(e string) string { return strings.ToLower(strings.TrimSpace(e)) }

func validEmail(e string) bool {
	if len(e) > 254 {
		return false
	}
	a, err := mail.ParseAddress(e)
	return err == nil && a.Address == e && a.Name == ""
}

func passwordProblem(p string) string {
	n := utf8.RuneCountInString(p)
	switch {
	case n < 8:
		return "Use at least 8 characters."
	case n > 128:
		return "Use at most 128 characters."
	}
	return ""
}
