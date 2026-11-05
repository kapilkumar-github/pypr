package auth

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
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
	VerifyTTL  = 48 * time.Hour
	// resendGap is the minimum time between verification emails a user can ask for.
	resendGap = time.Minute
	// autoResendGap is how often an unverified user gets a fresh link just by opening the app.
	autoResendGap = 24 * time.Hour
)

var (
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrInvalidToken       = errors.New("invalid or expired token")
	ErrTooSoon            = errors.New("verification email sent too recently")
)

// ValidationError maps field names to user-facing messages.
type ValidationError map[string]string

func (v ValidationError) Error() string { return "validation failed" }

type Service struct {
	log       *slog.Logger
	store     Store
	mail      email.Sender
	appURL    string
	now       func() time.Time
	dummyHash string
}

func NewService(store Store, mail email.Sender, appURL string, log *slog.Logger) (*Service, error) {
	dummy, err := HashPassword("dummy-password-for-timing")
	if err != nil {
		return nil, err
	}
	return &Service{log: log, store: store, mail: mail, appURL: strings.TrimRight(appURL, "/"), now: time.Now, dummyHash: dummy}, nil
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
	sess, err := s.startSession(ctx, u)
	if err != nil {
		return Session{}, err
	}
	// The account works without the email; a failed send is retried from the app.
	if err := s.sendVerification(ctx, u); err != nil {
		s.log.Error("send verification email", "user", u.ID, "err", err)
	}
	return sess, nil
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

// ResendVerification sends a new link on request, at most once a minute.
func (s *Service) ResendVerification(ctx context.Context, u User) error {
	if u.EmailVerified {
		return nil
	}
	last, err := s.store.LastVerificationSent(ctx, u.ID)
	if err != nil {
		return err
	}
	if s.now().Sub(last) < resendGap {
		return ErrTooSoon
	}
	return s.sendVerification(ctx, u)
}

// EnsureVerificationSent emails an unverified user a link if none was sent in the last day.
// Called when the app loads, so existing accounts get a link without signing up again.
func (s *Service) EnsureVerificationSent(ctx context.Context, u User) error {
	if u.EmailVerified {
		return nil
	}
	last, err := s.store.LastVerificationSent(ctx, u.ID)
	if err != nil || s.now().Sub(last) < autoResendGap {
		return err
	}
	return s.sendVerification(ctx, u)
}

func (s *Service) VerifyEmail(ctx context.Context, token string) error {
	err := s.store.VerifyEmail(ctx, hashToken(token), s.now())
	if errors.Is(err, ErrNotFound) {
		return ErrInvalidToken
	}
	return err
}

func (s *Service) sendVerification(ctx context.Context, u User) error {
	token, hash, err := newToken()
	if err != nil {
		return err
	}
	if err := s.store.CreateEmailVerification(ctx, u.ID, hash, s.now().Add(VerifyTTL)); err != nil {
		return err
	}
	link := s.appURL + "/verify-email?token=" + url.QueryEscape(token)
	return s.mail.Send(ctx, email.Message{
		To:      u.Email,
		Subject: "Verify your email for pypr",
		Text: fmt.Sprintf("Hi %s,\n\nConfirm this is your email address to start creating and editing resumes on pypr. "+
			"The link expires in 48 hours.\n\n%s\n\nIf you didn't create a pypr account, you can ignore this email.", u.Name, link),
	})
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
