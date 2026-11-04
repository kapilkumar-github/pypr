package httpx

import (
	"testing"
	"time"
)

func TestLimiter(t *testing.T) {
	now := time.Unix(0, 0)
	l := NewLimiter(2, time.Minute)
	l.now = func() time.Time { return now }

	if !l.Allow("a") || !l.Allow("a") {
		t.Fatal("first two calls should pass")
	}
	if l.Allow("a") {
		t.Fatal("third call should be limited")
	}
	if !l.Allow("b") {
		t.Fatal("other keys are independent")
	}
	now = now.Add(time.Minute + time.Second)
	if !l.Allow("a") {
		t.Fatal("window should reset")
	}
}
