// Package jobs tracks slow background work (LLM calls) that the web app polls for.
// Free models can take a minute, longer than the proxies in front of the API keep a request open.
package jobs

import (
	"crypto/rand"
	"sync"
	"time"
)

// TTL is how long a job is kept, finished or not.
const TTL = 10 * time.Minute

type Job[T any] struct {
	Done   bool
	Result T
	Err    error
}

type entry[T any] struct {
	Job[T]
	owner   string
	created time.Time
}

// Store keeps jobs in memory, in the process that runs them (single instance).
type Store[T any] struct {
	mu   sync.Mutex
	jobs map[string]*entry[T]
}

func NewStore[T any]() *Store[T] { return &Store[T]{jobs: map[string]*entry[T]{}} }

// Go runs work in the background for owner and returns the job id.
func (s *Store[T]) Go(owner string, work func() (T, error)) string {
	s.mu.Lock()
	for id, e := range s.jobs {
		if time.Since(e.created) > TTL {
			delete(s.jobs, id)
		}
	}
	id := rand.Text()
	s.jobs[id] = &entry[T]{owner: owner, created: time.Now()}
	s.mu.Unlock()

	go func() {
		result, err := work()
		s.mu.Lock()
		defer s.mu.Unlock()
		if e := s.jobs[id]; e != nil {
			e.Job = Job[T]{Done: true, Result: result, Err: err}
		}
	}()
	return id
}

// Get returns owner's job, or false when it doesn't exist, expired or belongs to someone else.
func (s *Store[T]) Get(id, owner string) (Job[T], bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	e := s.jobs[id]
	if e == nil || e.owner != owner {
		return Job[T]{}, false
	}
	return e.Job, true
}
