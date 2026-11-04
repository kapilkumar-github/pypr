package auth

import (
	"context"
	"fmt"
	"sync"
	"time"
)

type memStore struct {
	mu       sync.Mutex
	users    map[string]memUser
	sessions map[string]memSession
	resets   map[string]memReset
	seq      int
}

type memUser struct {
	User
	hash string
}
type memSession struct {
	userID  string
	expires time.Time
}
type memReset struct {
	userID  string
	expires time.Time
	used    bool
}

func newMemStore() *memStore {
	return &memStore{users: map[string]memUser{}, sessions: map[string]memSession{}, resets: map[string]memReset{}}
}

func (m *memStore) CreateUser(_ context.Context, name, email, hash string) (User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, u := range m.users {
		if u.Email == email {
			return User{}, ErrEmailTaken
		}
	}
	m.seq++
	u := User{ID: fmt.Sprint(m.seq), Name: name, Email: email, CreatedAt: time.Now()}
	m.users[u.ID] = memUser{u, hash}
	return u, nil
}

func (m *memStore) UserByEmail(_ context.Context, email string) (User, string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, u := range m.users {
		if u.Email == email {
			return u.User, u.hash, nil
		}
	}
	return User{}, "", ErrNotFound
}

func (m *memStore) UserBySession(_ context.Context, h []byte, now time.Time) (User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.sessions[string(h)]
	if !ok || !s.expires.After(now) {
		return User{}, ErrNotFound
	}
	return m.users[s.userID].User, nil
}

func (m *memStore) CreateSession(_ context.Context, userID string, h []byte, exp time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sessions[string(h)] = memSession{userID, exp}
	return nil
}

func (m *memStore) DeleteSession(_ context.Context, h []byte) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.sessions, string(h))
	return nil
}

func (m *memStore) CreatePasswordReset(_ context.Context, userID string, h []byte, exp time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.resets[string(h)] = memReset{userID: userID, expires: exp}
	return nil
}

func (m *memStore) ResetPassword(_ context.Context, h []byte, now time.Time, hash string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	r, ok := m.resets[string(h)]
	if !ok || r.used || !r.expires.After(now) {
		return ErrNotFound
	}
	r.used = true
	m.resets[string(h)] = r
	u := m.users[r.userID]
	u.hash = hash
	m.users[r.userID] = u
	for k, s := range m.sessions {
		if s.userID == r.userID {
			delete(m.sessions, k)
		}
	}
	return nil
}
