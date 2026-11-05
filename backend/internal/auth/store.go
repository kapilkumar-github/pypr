package auth

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNotFound   = errors.New("not found")
	ErrEmailTaken = errors.New("email already registered")
)

type User struct {
	ID            string    `json:"id"`
	Name          string    `json:"name"`
	Email         string    `json:"email"`
	EmailVerified bool      `json:"emailVerified"`
	CreatedAt     time.Time `json:"createdAt"`
}

type Store interface {
	CreateUser(ctx context.Context, name, email, passwordHash string) (User, error)
	UserByEmail(ctx context.Context, email string) (User, string, error)
	UserBySession(ctx context.Context, tokenHash []byte, now time.Time) (User, error)
	CreateSession(ctx context.Context, userID string, tokenHash []byte, expiresAt time.Time) error
	DeleteSession(ctx context.Context, tokenHash []byte) error
	CreatePasswordReset(ctx context.Context, userID string, tokenHash []byte, expiresAt time.Time) error
	// ResetPassword consumes a valid reset token, sets the new hash and revokes all sessions of that user.
	ResetPassword(ctx context.Context, tokenHash []byte, now time.Time, passwordHash string) error
	CreateEmailVerification(ctx context.Context, userID string, tokenHash []byte, expiresAt time.Time) error
	// LastVerificationSent is when the newest verification link was created, zero if never.
	LastVerificationSent(ctx context.Context, userID string) (time.Time, error)
	// VerifyEmail consumes a valid verification token and marks that user's email verified.
	VerifyEmail(ctx context.Context, tokenHash []byte, now time.Time) error
}

const userColumns = `u.id, u.name, u.email, u.email_verified_at is not null, u.created_at`

func scanUser(row pgx.Row, extra ...any) (User, error) {
	var u User
	err := row.Scan(append([]any{&u.ID, &u.Name, &u.Email, &u.EmailVerified, &u.CreatedAt}, extra...)...)
	return u, err
}

type PGStore struct{ DB *pgxpool.Pool }

func (s PGStore) CreateUser(ctx context.Context, name, email, hash string) (User, error) {
	u, err := scanUser(s.DB.QueryRow(ctx,
		`insert into users as u (name, email, password_hash) values ($1, $2, $3) returning `+userColumns,
		name, email, hash))
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return User{}, ErrEmailTaken
	}
	return u, err
}

func (s PGStore) UserByEmail(ctx context.Context, email string) (User, string, error) {
	var hash string
	u, err := scanUser(s.DB.QueryRow(ctx,
		`select `+userColumns+`, u.password_hash from users u where u.email = $1`, email), &hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, "", ErrNotFound
	}
	return u, hash, err
}

func (s PGStore) UserBySession(ctx context.Context, tokenHash []byte, now time.Time) (User, error) {
	u, err := scanUser(s.DB.QueryRow(ctx,
		`select `+userColumns+` from sessions s join users u on u.id = s.user_id
		 where s.token_hash = $1 and s.expires_at > $2`, tokenHash, now))
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrNotFound
	}
	return u, err
}

func (s PGStore) CreateSession(ctx context.Context, userID string, tokenHash []byte, expiresAt time.Time) error {
	_, err := s.DB.Exec(ctx,
		`insert into sessions (token_hash, user_id, expires_at) values ($1, $2, $3)`, tokenHash, userID, expiresAt)
	return err
}

func (s PGStore) DeleteSession(ctx context.Context, tokenHash []byte) error {
	_, err := s.DB.Exec(ctx, `delete from sessions where token_hash = $1`, tokenHash)
	return err
}

func (s PGStore) CreatePasswordReset(ctx context.Context, userID string, tokenHash []byte, expiresAt time.Time) error {
	_, err := s.DB.Exec(ctx,
		`insert into password_resets (token_hash, user_id, expires_at) values ($1, $2, $3)`, tokenHash, userID, expiresAt)
	return err
}

func (s PGStore) ResetPassword(ctx context.Context, tokenHash []byte, now time.Time, hash string) error {
	return pgx.BeginFunc(ctx, s.DB, func(tx pgx.Tx) error {
		var userID string
		err := tx.QueryRow(ctx,
			`update password_resets set used_at = $2
			 where token_hash = $1 and used_at is null and expires_at > $2
			 returning user_id`, tokenHash, now).Scan(&userID)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `update users set password_hash = $2, updated_at = $3 where id = $1`, userID, hash, now); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `update password_resets set used_at = $2 where user_id = $1 and used_at is null`, userID, now); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `delete from sessions where user_id = $1`, userID)
		return err
	})
}

func (s PGStore) CreateEmailVerification(ctx context.Context, userID string, tokenHash []byte, expiresAt time.Time) error {
	_, err := s.DB.Exec(ctx,
		`insert into email_verifications (token_hash, user_id, expires_at) values ($1, $2, $3)`, tokenHash, userID, expiresAt)
	return err
}

func (s PGStore) LastVerificationSent(ctx context.Context, userID string) (time.Time, error) {
	var t *time.Time
	err := s.DB.QueryRow(ctx, `select max(created_at) from email_verifications where user_id = $1`, userID).Scan(&t)
	if err != nil || t == nil {
		return time.Time{}, err
	}
	return *t, nil
}

func (s PGStore) VerifyEmail(ctx context.Context, tokenHash []byte, now time.Time) error {
	return pgx.BeginFunc(ctx, s.DB, func(tx pgx.Tx) error {
		var userID string
		err := tx.QueryRow(ctx,
			`update email_verifications set used_at = $2
			 where token_hash = $1 and used_at is null and expires_at > $2
			 returning user_id`, tokenHash, now).Scan(&userID)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx,
			`update users set email_verified_at = coalesce(email_verified_at, $2), updated_at = $2 where id = $1`, userID, now)
		return err
	})
}
