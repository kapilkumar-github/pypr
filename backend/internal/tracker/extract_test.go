package tracker

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"testing"
	"time"
)

const jobPage = `<!doctype html><html><head><title>Careers</title>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"X"},
{"@type":"JobPosting","title":"Senior Backend Engineer","identifier":{"@type":"PropertyValue","value":"REQ-9"},
"hiringOrganization":{"@type":"Organization","name":"Acme &amp; Co"},
"employmentType":["FULL_TIME"],
"jobLocation":[{"@type":"Place","address":{"addressLocality":"Berlin","addressCountry":{"name":"DE"}}}],
"baseSalary":{"currency":"eur","value":{"minValue":70000,"maxValue":90000,"unitText":"YEAR"}},
"description":"<p>Build APIs.</p><script>alert(1)<\/script><ul><li>Go</li><li onclick=\"x()\">Postgres</li></ul><img src=x onerror=alert(2)>"}]}
</script></head><body></body></html>`

func TestParsePageJobPosting(t *testing.T) {
	out := parsePage([]byte(jobPage), JobInput{DiscoveryURL: "https://acme.com/j/1", WorkArrangement: "unknown"})
	f := out.Fields
	if out.Status != "ok" || f.Title != "Senior Backend Engineer" || f.Company != "Acme & Co" || f.Location != "Berlin, DE" ||
		f.EmploymentType != "full time" || f.ExternalID != "REQ-9" {
		t.Fatalf("unexpected extraction: %+v", out)
	}
	if f.SalaryMin == nil || *f.SalaryMin != 70000 || *f.SalaryMax != 90000 || f.SalaryCurrency != "EUR" || f.SalaryPeriod != "year" {
		t.Errorf("salary: %+v", f)
	}
	if strings.ContainsAny(f.Description, "<>") || strings.Contains(f.Description, "alert") {
		t.Errorf("description not sanitized: %q", f.Description)
	}
	if f.Description != "Build APIs.\n• Go\n• Postgres" {
		t.Errorf("description = %q", f.Description)
	}
}

func TestParsePageFallbacks(t *testing.T) {
	partial := parsePage([]byte(`<html><head><meta property="og:title" content="Data Engineer"><meta property="og:site_name" content="Acme"></head></html>`), JobInput{})
	if partial.Status != "partial" || partial.Fields.Title != "Data Engineer" || partial.Fields.Company != "Acme" || partial.Message == "" {
		t.Errorf("partial: %+v", partial)
	}
	login := parsePage([]byte(`<html><body><form><input type="password"></form></body></html>`), JobInput{})
	if login.Status != "failed" || login.Reason != "requires_auth" {
		t.Errorf("login page: %+v", login)
	}
	empty := parsePage([]byte(`<html><body><div id="root"></div></body></html>`), JobInput{Source: "workday"})
	if empty.Status != "failed" || empty.Reason != "unsupported" || empty.Fields.Source != "workday" {
		t.Errorf("app shell page: %+v", empty)
	}
	broken := parsePage([]byte(`<script type="application/ld+json">{not json</script><title>Ops Lead</title>`), JobInput{})
	if broken.Status != "partial" || broken.Fields.Title != "Ops Lead" {
		t.Errorf("broken json-ld: %+v", broken)
	}
}

func loopbackOnly(a netip.Addr) bool { return a.IsLoopback() }

func TestExtractFetches(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/job":
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte(jobPage))
		case "/hop":
			http.Redirect(w, r, "/job", http.StatusFound)
		case "/private":
			http.Redirect(w, r, "http://10.1.2.3/admin", http.StatusFound)
		case "/meta":
			http.Redirect(w, r, "http://localhost:8080/", http.StatusFound)
		case "/file":
			http.Redirect(w, r, "file:///etc/passwd", http.StatusFound)
		case "/login":
			w.WriteHeader(http.StatusForbidden)
		case "/gone":
			w.WriteHeader(http.StatusNotFound)
		case "/pdf":
			w.Header().Set("Content-Type", "application/pdf")
		case "/slow":
			time.Sleep(2 * time.Second)
		case "/huge":
			w.Header().Set("Content-Type", "text/html")
			_, _ = w.Write([]byte(`<html><head><title>Huge job</title></head><body>`))
			chunk := []byte(strings.Repeat("x", 1<<20))
			for i := 0; i < 20; i++ {
				if _, err := w.Write(chunk); err != nil {
					return
				}
			}
		}
	}))
	defer srv.Close()

	// httptest listens on loopback and a random port: allow exactly those, keep every other check.
	f := NewFetcher(loopbackOnly)
	f.ports = []string{strings.TrimPrefix(srv.URL[strings.LastIndex(srv.URL, ":"):], ":")}
	f.client.Timeout = time.Second
	ctx := context.Background()
	extract := func(path string) Extraction { return f.Extract(ctx, srv.URL+path) }

	if out := extract("/hop"); out.Status != "ok" || out.Fields.Title != "Senior Backend Engineer" {
		t.Errorf("redirected page: %+v", out)
	}
	for path, reason := range map[string]string{
		"/private": "blocked_url", "/meta": "blocked_url", "/file": "blocked_url",
		"/login": "requires_auth", "/gone": "not_found", "/pdf": "unsupported", "/slow": "timeout",
	} {
		if out := extract(path); out.Status != "failed" || out.Reason != reason {
			t.Errorf("%s: got %s/%s (%s), want failed/%s", path, out.Status, out.Reason, out.Message, reason)
		}
	}
	if out := extract("/huge"); out.Status != "partial" || out.Fields.Title != "Huge job" {
		t.Errorf("huge page should be read up to the cap: %+v", out.Status)
	}
}

func TestExtractBlocksUnsafeURLs(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("private server must not be reached")
	}))
	defer srv.Close()
	f := NewFetcher(nil) // production policy: public addresses only
	f.client.Timeout = time.Second
	for _, u := range []string{
		srv.URL,                          // loopback on a custom port
		"http://127.0.0.1/",              // loopback
		"http://[::1]/",                  // IPv6 loopback
		"http://169.254.169.254/latest/", // cloud metadata
		"http://10.0.0.1/",               // private
		"http://localhost/",              // name
		"http://user:pass@example.com/",  // credentials
		"ftp://example.com/job",          // scheme
	} {
		out := f.Extract(context.Background(), u)
		if out.Status != "failed" || out.Reason != "blocked_url" {
			t.Errorf("%s: got %s/%s, want failed/blocked_url", u, out.Status, out.Reason)
		}
	}
}

func TestPublicAddr(t *testing.T) {
	for addr, want := range map[string]bool{
		"8.8.8.8": true, "2606:4700::1111": true,
		"127.0.0.1": false, "10.0.0.1": false, "172.16.0.1": false, "192.168.1.1": false, "169.254.169.254": false,
		"100.64.0.1": false, "0.0.0.0": false, "::1": false, "fc00::1": false, "fe80::1": false, "64:ff9b::a00:1": false,
		"224.0.0.1": false, "255.255.255.255": false,
	} {
		if got := publicAddr(netip.MustParseAddr(addr)); got != want {
			t.Errorf("publicAddr(%s) = %v, want %v", addr, got, want)
		}
	}
}
