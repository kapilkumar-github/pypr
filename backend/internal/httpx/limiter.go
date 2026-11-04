package httpx

import (
	"sync"
	"time"
)

// Limiter is a fixed-window, in-memory rate limiter keyed by an arbitrary string.
// Good enough for a single API instance; move to a shared store before scaling out.
type Limiter struct {
	mu      sync.Mutex
	max     int
	window  time.Duration
	buckets map[string]bucket
	now     func() time.Time
}

type bucket struct {
	count int
	reset time.Time
}

func NewLimiter(max int, window time.Duration) *Limiter {
	return &Limiter{max: max, window: window, buckets: map[string]bucket{}, now: time.Now}
}

func (l *Limiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	if len(l.buckets) > 10_000 {
		for k, b := range l.buckets {
			if now.After(b.reset) {
				delete(l.buckets, k)
			}
		}
	}
	b, ok := l.buckets[key]
	if !ok || now.After(b.reset) {
		b = bucket{reset: now.Add(l.window)}
	}
	if b.count >= l.max {
		return false
	}
	b.count++
	l.buckets[key] = b
	return true
}
