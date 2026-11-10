package tracker

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

const extID = "abcdefghijklmnopabcdefghijklmnop"

var extRedirect = "https://" + extID + ".chromiumapp.org/pypr"

func challengeFor(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

// call sends a JSON request with optional bearer token and extra headers.
func call(t *testing.T, e *env, method, path, bearer string, headers map[string]string, body any) (int, map[string]any) {
	t.Helper()
	var buf bytes.Buffer
	_ = json.NewEncoder(&buf).Encode(body)
	req, _ := http.NewRequest(method, e.srv.URL+path, &buf)
	req.Header.Set("Content-Type", "application/json")
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	out := map[string]any{}
	_ = json.Unmarshal(raw, &out)
	return res.StatusCode, out
}

func TestExtensionConnect(t *testing.T) {
	e := newEnv(t)
	a := e.user()
	verifier := strings.Repeat("v", 43)
	state := strings.Repeat("s", 20)
	authorize := func(redirect string) (int, string) {
		var buf bytes.Buffer
		_ = json.NewEncoder(&buf).Encode(map[string]string{"state": state, "challenge": challengeFor(verifier), "redirectUri": redirect})
		req, _ := http.NewRequest("POST", e.srv.URL+"/api/ext/authorize", &buf)
		req.Header.Set("Content-Type", "application/json")
		req.AddCookie(&http.Cookie{Name: "pypr_session", Value: a.token})
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		var out struct{ Code string }
		_ = json.NewDecoder(res.Body).Decode(&out)
		return res.StatusCode, out.Code
	}

	// Redirects must be exactly the allowed extension's callback.
	for _, bad := range []string{
		"https://evil.chromiumapp.org/pypr",
		extRedirect + "/x",
		extRedirect + "?a=1",
		"https://" + extID + ".chromiumapp.org.evil.com/pypr",
		"http://" + extID + ".chromiumapp.org/pypr",
		"https://example.com/pypr",
	} {
		if st, _ := authorize(bad); st != 400 {
			t.Errorf("redirect %q: status %d, want 400", bad, st)
		}
	}
	// No session: refused.
	if st, _ := call(t, e, "POST", "/api/ext/authorize", "", nil, map[string]string{}); st != 401 {
		t.Errorf("anonymous authorize: %d", st)
	}

	st, code := authorize(extRedirect)
	if st != 200 || code == "" {
		t.Fatalf("authorize: %d %q", st, code)
	}
	exchange := func(code, verifier, redirect string) (int, map[string]any) {
		return call(t, e, "POST", "/api/ext/token", "", nil, map[string]string{"code": code, "verifier": verifier, "redirectUri": redirect})
	}
	// Wrong verifier spends the code.
	if st, _ := exchange(code, strings.Repeat("w", 43), extRedirect); st != 400 {
		t.Errorf("wrong verifier: %d", st)
	}
	if st, _ := exchange(code, verifier, extRedirect); st != 400 {
		t.Errorf("code reused after a failed attempt: %d", st)
	}

	_, code = authorize(extRedirect)
	if st, _ := exchange(code, verifier, "https://"+extID+".chromiumapp.org/other"); st != 400 {
		t.Errorf("wrong redirect at exchange: %d", st)
	}
	_, code = authorize(extRedirect)
	st, out := exchange(code, verifier, extRedirect)
	if st != 200 {
		t.Fatalf("exchange: %d %v", st, out)
	}
	token, _ := out["token"].(string)
	if token == "" || token == a.token {
		t.Fatalf("token: %q", token)
	}
	if st, _ := exchange(code, verifier, extRedirect); st != 400 {
		t.Errorf("code is single use: %d", st)
	}

	// The bearer token works as the same user.
	st, me := call(t, e, "GET", "/api/auth/me", token, nil, nil)
	if st != 200 || me["id"] != a.id {
		t.Fatalf("me with bearer: %d %v", st, me)
	}
	// It can't mint more tokens.
	if st, _ := call(t, e, "POST", "/api/ext/authorize", token, nil, map[string]string{"state": state, "challenge": challengeFor(verifier), "redirectUri": extRedirect}); st != 403 {
		t.Errorf("bearer authorize: %d", st)
	}
	// A bad bearer is refused even when a cookie would be valid.
	if st, _ := call(t, e, "GET", "/api/auth/me", "nope", nil, nil); st != 401 {
		t.Errorf("bad bearer: %d", st)
	}
	var kind string
	if err := e.pool.QueryRow(t.Context(), `select kind from sessions where user_id = $1 order by created_at desc limit 1`, a.id).Scan(&kind); err != nil || kind != "extension" {
		t.Errorf("session kind %q, %v", kind, err)
	}

	// Logout revokes only that token.
	if st, _ := call(t, e, "POST", "/api/auth/logout", token, nil, map[string]string{}); st != 204 {
		t.Errorf("logout: %d", st)
	}
	if st, _ := call(t, e, "GET", "/api/auth/me", token, nil, nil); st != 401 {
		t.Errorf("after logout: %d", st)
	}
	a.do("GET", "/api/auth/me", nil, nil, 200)
}

func TestIdempotentSave(t *testing.T) {
	e := newEnv(t)
	a, b := e.user(), e.user()
	job := map[string]any{"company": "Acme", "title": "Engineer", "discoveryUrl": "https://example.com/jobs/1"}
	key := "ext-0123456789abcdef"

	// First request with a key creates; a retry returns the same job with 200.
	var created, retried Detail
	hdr := map[string]string{"Idempotency-Key": key}
	do := func(c *client, out *Detail, want int) {
		st, raw := call(t, e, "POST", "/api/tracked-jobs", c.token, hdr, job)
		if st != want {
			t.Fatalf("status %d, want %d: %v", st, want, raw)
		}
		b, _ := json.Marshal(raw)
		_ = json.Unmarshal(b, out)
	}
	do(a, &created, 201)
	do(a, &retried, 200)
	if created.ID == "" || created.ID != retried.ID {
		t.Fatalf("retry made a second job: %q vs %q", created.ID, retried.ID)
	}
	var n int
	_ = e.pool.QueryRow(t.Context(), `select count(*) from tracked_jobs where user_id = $1 and client_key = $2`, a.id, key).Scan(&n)
	if n != 1 {
		t.Errorf("%d rows for the key", n)
	}
	// The key is per user: another user with the same key gets their own job.
	var other Detail
	do(b, &other, 201)
	if other.ID == created.ID {
		t.Error("idempotency key leaked across users")
	}
	// Malformed keys are rejected.
	if st, _ := call(t, e, "POST", "/api/tracked-jobs", a.token, map[string]string{"Idempotency-Key": "short"}, job); st != 422 && st != 400 {
		t.Errorf("short key: %d", st)
	}
}
