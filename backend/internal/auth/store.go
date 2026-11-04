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
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	CreatedAt time.Time `json:"createdAt"`
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
}

type PGStore struct{ DB *pgxpool.Pool }

func (s PGStore) CreateUser(ctx context.Context, name, email, hash string) (User, error) {
	var u User
	err := s.DB.QueryRow(ctx,
		`insert into users (name, email, password_hash) values ($1, $2, $3) returning id, name, email, created_at`,
		name, email, hash).Scan(&u.ID, &u.Name, &u.Email, &u.CreatedAt)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return User{}, ErrEmailTaken
	}
	return u, err
}

func (s PGStore) UserByEmail(ctx context.Context, email string) (User, string, error) {
	var u User
	var hash string
	err := s.DB.QueryRow(ctx,
		`select id, name, email, created_at, password_hash from users where email = $1`, email).
		Scan(&u.ID, &u.Name, &u.Email, &u.CreatedAt, &hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, "", ErrNotFound
	}
	return u, hash, err
}

func (s PGStore) UserBySession(ctx context.Context, tokenHash []byte, now time.Time) (User, error) {
	var u User
	err := s.DB.QueryRow(ctx,
		`select u.id, u.name, u.email, u.created_at from sessions s join users u on u.id = s.user_id
		 where s.token_hash = $1 and s.expires_at > $2`, tokenHash, now).
		Scan(&u.ID, &u.Name, &u.Email, &u.CreatedAt)
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
