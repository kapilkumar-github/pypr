package admin

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func status(h *Handler, code string) int {
	req := httptest.NewRequest("GET", "/api/admin/stats", nil)
	if code != "" {
		req.Header.Set("X-Admin-Code", code)
	}
	req.Header.Set("CF-Connecting-IP", "1.2.3.4")
	rec := httptest.NewRecorder()
	mux := http.NewServeMux()
	h.Register(mux)
	mux.ServeHTTP(rec, req)
	return rec.Code
}

func TestRejectsBadOrMissingCode(t *testing.T) {
	h := NewHandler(nil, nil, "secret")
	for _, c := range []string{"", "wrong"} {
		if got := status(h, c); got != http.StatusUnauthorized {
			t.Fatalf("code %q: got %d, want 401", c, got)
		}
	}
}

func TestDisabledWithoutConfiguredCode(t *testing.T) {
	h := NewHandler(nil, nil, "")
	if got := status(h, ""); got != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", got)
	}
}

func TestRateLimited(t *testing.T) {
	h := NewHandler(nil, nil, "secret")
	var last int
	for i := 0; i < 11; i++ {
		last = status(h, "wrong")
	}
	if last != http.StatusTooManyRequests {
		t.Fatalf("got %d, want 429", last)
	}
}
