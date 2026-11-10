package tracker

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"syscall"
	"time"

	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

// Extraction is a best-effort reading of a public job page. Fields stay empty when the page doesn't
// state them; nothing is guessed. The user reviews and edits everything before saving.
type Extraction struct {
	// ok: a structured JobPosting was found. partial: only page metadata. failed: nothing usable.
	Status string `json:"status"`
	// Set when Status is failed: blocked_url, requires_auth, not_found, unsupported, timeout, fetch_failed.
	Reason  string   `json:"reason,omitempty"`
	Message string   `json:"message,omitempty"`
	Fields  JobInput `json:"fields"`
}

const (
	fetchTimeout = 10 * time.Second
	maxPageBytes = 3 << 20
	maxRedirects = 5
)

// Fetcher downloads job pages without reaching private networks.
type Fetcher struct {
	client *http.Client
	// ports a URL may name explicitly; the default ports are always allowed.
	ports []string
}

// errBlocked marks a destination the fetcher refuses (non-public address, port, scheme).
var errBlocked = errors.New("blocked destination")

// NewFetcher returns a Fetcher. allow decides which resolved IPs may be dialed; nil means public
// addresses only. Tests pass a looser check to reach httptest servers.
func NewFetcher(allow func(netip.Addr) bool) *Fetcher {
	if allow == nil {
		allow = publicAddr
	}
	dialer := &net.Dialer{
		Timeout: 5 * time.Second,
		// Checked on the address actually dialed, after DNS, so rebinding and redirects can't slip past.
		Control: func(_, address string, _ syscall.RawConn) error {
			ap, err := netip.ParseAddrPort(address)
			if err != nil || !allow(ap.Addr().Unmap()) {
				return errBlocked
			}
			return nil
		},
	}
	transport := &http.Transport{
		Proxy:                  nil, // never route through an environment proxy that could reach internal hosts
		DialContext:            dialer.DialContext,
		TLSHandshakeTimeout:    5 * time.Second,
		ResponseHeaderTimeout:  8 * time.Second,
		MaxResponseHeaderBytes: 64 << 10,
		DisableKeepAlives:      true,
	}
	f := &Fetcher{}
	f.client = &http.Client{
		Transport: transport,
		Timeout:   fetchTimeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= maxRedirects {
				return errors.New("too many redirects")
			}
			return f.checkTarget(req.URL)
		},
	}
	return f
}

// blockedPrefixes are non-public ranges netip's predicates don't cover.
var blockedPrefixes = []netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/8"),
	netip.MustParsePrefix("100.64.0.0/10"), // carrier-grade NAT
	netip.MustParsePrefix("192.0.0.0/24"),
	netip.MustParsePrefix("192.0.2.0/24"),
	netip.MustParsePrefix("198.18.0.0/15"),
	netip.MustParsePrefix("198.51.100.0/24"),
	netip.MustParsePrefix("203.0.113.0/24"),
	netip.MustParsePrefix("240.0.0.0/4"),
	netip.MustParsePrefix("64:ff9b::/96"), // NAT64 can map to any IPv4, including private ones
	netip.MustParsePrefix("64:ff9b:1::/48"),
	netip.MustParsePrefix("2001:db8::/32"),
	netip.MustParsePrefix("2002::/16"), // 6to4 embeds an IPv4 address
	netip.MustParsePrefix("100::/64"),
}

func publicAddr(a netip.Addr) bool {
	if !a.IsValid() || !a.IsGlobalUnicast() || a.IsPrivate() || a.IsLoopback() || a.IsLinkLocalUnicast() ||
		a.IsMulticast() || a.IsUnspecified() {
		return false
	}
	for _, p := range blockedPrefixes {
		if p.Contains(a) {
			return false
		}
	}
	return true
}

// checkTarget rejects URLs the fetcher never requests: other schemes, credentials, non-default ports
// and literal addresses outside the public internet.
func (f *Fetcher) checkTarget(u *url.URL) error {
	if u.Scheme != "http" && u.Scheme != "https" {
		return errBlocked
	}
	if u.User != nil || u.Hostname() == "" {
		return errBlocked
	}
	if p := u.Port(); p != "" && p != "80" && p != "443" && !slices.Contains(f.ports, p) {
		return errBlocked
	}
	host := strings.ToLower(strings.TrimSuffix(u.Hostname(), "."))
	if host == "localhost" || strings.HasSuffix(host, ".localhost") || strings.HasSuffix(host, ".internal") ||
		strings.HasSuffix(host, ".local") {
		return errBlocked
	}
	return nil
}

// Extract fetches rawURL and reads job details from it. Errors are reported in the result, with the
// source and job ID the URL itself gives, so the manual form starts prefilled.
func (f *Fetcher) Extract(ctx context.Context, rawURL string) Extraction {
	source, extID := DetectSource(rawURL)
	base := JobInput{DiscoveryURL: rawURL, ApplicationURL: rawURL, Source: source, ExternalID: extID, WorkArrangement: "unknown"}
	fail := func(reason, msg string) Extraction {
		return Extraction{Status: "failed", Reason: reason, Message: msg, Fields: base}
	}

	u, err := url.Parse(rawURL)
	if err != nil || f.checkTarget(u) != nil {
		return fail("blocked_url", "This address can't be fetched. Enter the details by hand.")
	}
	ctx, cancel := context.WithTimeout(ctx, fetchTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return fail("blocked_url", "This address can't be fetched. Enter the details by hand.")
	}
	req.Header.Set("User-Agent", "PyprJobTracker/1.0 (+https://pypr.work)")
	req.Header.Set("Accept", "text/html,application/xhtml+xml")
	res, err := f.client.Do(req)
	if err != nil {
		switch {
		case errors.Is(err, errBlocked):
			return fail("blocked_url", "This address points to a private or unsupported destination. Enter the details by hand.")
		case errors.Is(err, context.DeadlineExceeded) || isTimeout(err):
			return fail("timeout", "The page took too long to respond. Enter the details by hand.")
		}
		return fail("fetch_failed", "Couldn't load the page. Enter the details by hand.")
	}
	defer res.Body.Close()

	switch {
	case res.StatusCode == http.StatusUnauthorized || res.StatusCode == http.StatusForbidden:
		return fail("requires_auth", "The page needs a sign-in or blocks automated reading. Enter the details by hand.")
	case res.StatusCode == http.StatusNotFound || res.StatusCode == http.StatusGone:
		return fail("not_found", "The listing wasn't found. It may have closed.")
	case res.StatusCode < 200 || res.StatusCode > 299:
		return fail("fetch_failed", fmt.Sprintf("The site answered with status %d. Enter the details by hand.", res.StatusCode))
	}
	if mt, _, _ := mime.ParseMediaType(res.Header.Get("Content-Type")); mt != "text/html" && mt != "application/xhtml+xml" {
		return fail("unsupported", "This address isn't a web page Pypr can read. Enter the details by hand.")
	}
	// Pages over the cap are read up to it; job data normally sits near the top.
	body, err := io.ReadAll(io.LimitReader(res.Body, maxPageBytes))
	if err != nil {
		if isTimeout(err) || errors.Is(err, context.DeadlineExceeded) {
			return fail("timeout", "The page took too long to respond. Enter the details by hand.")
		}
		return fail("fetch_failed", "Couldn't load the page. Enter the details by hand.")
	}
	final := res.Request.URL.String()
	out := parsePage(body, base)
	if out.Fields.ApplicationURL == rawURL && final != rawURL {
		out.Fields.ApplicationURL = final
	}
	if out.Status == "failed" {
		return out
	}
	// Re-derive the ATS from the final address when the original was a redirector.
	if out.Fields.Source == "company_site" || out.Fields.Source == "" {
		if s, id := DetectSource(final); s != "company_site" {
			out.Fields.Source = s
			if out.Fields.ExternalID == "" {
				out.Fields.ExternalID = id
			}
		}
	}
	return out
}

func isTimeout(err error) bool {
	var ne net.Error
	return errors.As(err, &ne) && ne.Timeout()
}

// page is what parsePage collects from the HTML.
type page struct {
	title       string
	meta        map[string]string
	jsonLD      [][]byte
	hasPassword bool
}

func scan(body []byte) page {
	p := page{meta: map[string]string{}}
	z := html.NewTokenizer(bytes.NewReader(body))
	var inScript, inTitle bool
	var script bytes.Buffer
	for {
		switch z.Next() {
		case html.ErrorToken:
			return p
		case html.StartTagToken, html.SelfClosingTagToken:
			tok := z.Token()
			switch tok.DataAtom {
			case atom.Script:
				if strings.EqualFold(strings.TrimSpace(attr(tok, "type")), "application/ld+json") {
					inScript = true
					script.Reset()
				}
			case atom.Title:
				inTitle = p.title == ""
			case atom.Meta:
				key := strings.ToLower(attr(tok, "property"))
				if key == "" {
					key = strings.ToLower(attr(tok, "name"))
				}
				if key != "" && p.meta[key] == "" {
					p.meta[key] = attr(tok, "content")
				}
			case atom.Input:
				if strings.EqualFold(attr(tok, "type"), "password") {
					p.hasPassword = true
				}
			}
		case html.TextToken:
			if inScript {
				script.Write(z.Text())
			} else if inTitle {
				p.title += string(z.Text())
			}
		case html.EndTagToken:
			switch z.Token().DataAtom {
			case atom.Script:
				if inScript {
					p.jsonLD = append(p.jsonLD, bytes.Clone(script.Bytes()))
					inScript = false
				}
			case atom.Title:
				inTitle = false
			}
		}
	}
}

func attr(t html.Token, name string) string {
	for _, a := range t.Attr {
		if a.Key == name {
			return a.Val
		}
	}
	return ""
}

func parsePage(body []byte, base JobInput) Extraction {
	p := scan(body)
	for _, raw := range p.jsonLD {
		if jp := findJobPosting(raw); jp != nil {
			return Extraction{Status: "ok", Fields: fromJobPosting(jp, base)}
		}
	}
	f := base
	f.Title = clip(cleanLine(firstNonEmpty(p.meta["og:title"], p.meta["twitter:title"], p.title)), 300)
	f.Company = clip(cleanLine(p.meta["og:site_name"]), 200)
	f.Description = clip(cleanText(firstNonEmpty(p.meta["og:description"], p.meta["description"])), maxDescription)
	if f.Title == "" && p.hasPassword {
		return Extraction{Status: "failed", Reason: "requires_auth",
			Message: "The page asks for a sign-in. Enter the details by hand.", Fields: base}
	}
	if f.Title == "" {
		return Extraction{Status: "failed", Reason: "unsupported",
			Message: "No job details found on this page. Enter them by hand.", Fields: base}
	}
	return Extraction{Status: "partial", Fields: f,
		Message: "This page has no structured job data. Only the page title and summary were read; check every field."}
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func clip(s string, max int) string {
	if r := []rune(s); len(r) > max {
		return string(r[:max])
	}
	return s
}

// findJobPosting looks for a JobPosting in a JSON-LD block: a single object, an array, or an @graph.
func findJobPosting(raw []byte) map[string]any {
	var v any
	if json.Unmarshal(bytes.TrimSpace(raw), &v) != nil {
		return nil
	}
	var walk func(v any, depth int) map[string]any
	walk = func(v any, depth int) map[string]any {
		if depth > 4 {
			return nil
		}
		switch t := v.(type) {
		case []any:
			for _, x := range t {
				if m := walk(x, depth+1); m != nil {
					return m
				}
			}
		case map[string]any:
			if hasType(t["@type"], "JobPosting") {
				return t
			}
			if g, ok := t["@graph"]; ok {
				return walk(g, depth+1)
			}
		}
		return nil
	}
	return walk(v, 0)
}

func hasType(v any, want string) bool {
	switch t := v.(type) {
	case string:
		return t == want
	case []any:
		for _, x := range t {
			if s, ok := x.(string); ok && s == want {
				return true
			}
		}
	}
	return false
}

func str(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64)
	case map[string]any:
		return firstNonEmpty(str(t["name"]), str(t["value"]))
	}
	return ""
}

func num(v any) *float64 {
	switch t := v.(type) {
	case float64:
		if t >= 0 && t < 1e10 {
			return &t
		}
	case string:
		if f, err := strconv.ParseFloat(strings.ReplaceAll(strings.TrimSpace(t), ",", ""), 64); err == nil && f >= 0 && f < 1e10 {
			return &f
		}
	}
	return nil
}

func list(v any) []any {
	if a, ok := v.([]any); ok {
		return a
	}
	if v == nil {
		return nil
	}
	return []any{v}
}

var periods = map[string]string{"YEAR": "year", "MONTH": "month", "WEEK": "week", "DAY": "day", "HOUR": "hour"}

func fromJobPosting(jp map[string]any, base JobInput) JobInput {
	f := base
	f.Title = clip(cleanLine(htmlToText(str(jp["title"]))), 300)
	f.Company = clip(cleanLine(htmlToText(str(jp["hiringOrganization"]))), 200)
	desc := str(jp["description"])
	if strings.Contains(desc, "&lt;") {
		// Some sites escape the HTML twice; decode once more so tags don't show as text.
		desc = htmlToText(desc)
	}
	f.Description = clip(htmlToText(desc), maxDescription)

	var types []string
	for _, t := range list(jp["employmentType"]) {
		if s := cleanLine(str(t)); s != "" {
			types = append(types, strings.ReplaceAll(strings.ToLower(s), "_", " "))
		}
	}
	f.EmploymentType = clip(strings.Join(types, ", "), 100)

	var places []string
	for _, loc := range list(jp["jobLocation"]) {
		m, _ := loc.(map[string]any)
		addr, _ := m["address"].(map[string]any)
		if addr == nil {
			if s := cleanLine(str(m["address"])); s != "" {
				places = append(places, s)
			}
			continue
		}
		var bits []string
		for _, k := range []string{"addressLocality", "addressRegion", "addressCountry"} {
			if s := cleanLine(str(addr[k])); s != "" {
				bits = append(bits, s)
			}
		}
		if s := strings.Join(bits, ", "); s != "" {
			places = append(places, s)
		}
	}
	f.Location = clip(strings.Join(places, "; "), 300)
	if strings.EqualFold(str(jp["jobLocationType"]), "TELECOMMUTE") {
		f.WorkArrangement = "remote"
		if f.Location == "" {
			var req []string
			for _, r := range list(jp["applicantLocationRequirements"]) {
				if s := cleanLine(str(r)); s != "" {
					req = append(req, s)
				}
			}
			f.Location = clip(strings.Join(req, "; "), 300)
		}
	}

	if sal, ok := jp["baseSalary"].(map[string]any); ok {
		cur := strings.ToUpper(cleanLine(str(sal["currency"])))
		val, _ := sal["value"].(map[string]any)
		if val == nil {
			f.SalaryMin = num(sal["value"])
		} else {
			f.SalaryMin, f.SalaryMax = num(val["minValue"]), num(val["maxValue"])
			if f.SalaryMin == nil && f.SalaryMax == nil {
				f.SalaryMin = num(val["value"])
			}
			f.SalaryPeriod = periods[strings.ToUpper(str(val["unitText"]))]
		}
		if f.SalaryMin != nil && f.SalaryMax != nil && *f.SalaryMin > *f.SalaryMax {
			f.SalaryMin, f.SalaryMax = nil, nil
		}
		if (f.SalaryMin != nil || f.SalaryMax != nil) && currencyRe.MatchString(cur) {
			f.SalaryCurrency = cur
		}
	}

	if id := clip(cleanLine(str(jp["identifier"])), 200); id != "" && f.ExternalID == "" {
		f.ExternalID = id
	}
	if u := strings.TrimSpace(str(jp["url"])); validURL(u) {
		f.ApplicationURL = u
	}
	return f
}

// blockTags start a new line when converting HTML to text.
var blockTags = map[atom.Atom]bool{
	atom.P: true, atom.Div: true, atom.Br: true, atom.Li: true, atom.Ul: true, atom.Ol: true, atom.H1: true,
	atom.H2: true, atom.H3: true, atom.H4: true, atom.H5: true, atom.H6: true, atom.Tr: true, atom.Section: true,
}

// htmlToText turns a job description's HTML into plain text: tags dropped (script and style content
// too), entities decoded, paragraphs and list items kept as lines. The web app renders it as text.
func htmlToText(s string) string {
	if !strings.ContainsAny(s, "<&") {
		return cleanText(s)
	}
	z := html.NewTokenizer(strings.NewReader(s))
	var b strings.Builder
	skip := 0
	newline := func() {
		if b.Len() > 0 && !strings.HasSuffix(b.String(), "\n") {
			b.WriteByte('\n')
		}
	}
	for {
		switch z.Next() {
		case html.ErrorToken:
			lines := strings.Split(b.String(), "\n")
			out := lines[:0]
			for _, l := range lines {
				if l = cleanLine(l); l != "" {
					out = append(out, l)
				}
			}
			return cleanText(strings.Join(out, "\n"))
		case html.StartTagToken, html.SelfClosingTagToken:
			name, _ := z.TagName()
			a := atom.Lookup(name)
			if a == atom.Script || a == atom.Style {
				skip++
			}
			if blockTags[a] {
				newline()
			}
			if a == atom.Li {
				b.WriteString("• ")
			}
		case html.EndTagToken:
			name, _ := z.TagName()
			a := atom.Lookup(name)
			if (a == atom.Script || a == atom.Style) && skip > 0 {
				skip--
			}
			if blockTags[a] {
				newline()
			}
		case html.TextToken:
			if skip == 0 {
				b.WriteString(strings.ReplaceAll(string(z.Text()), "\n", " "))
			}
		}
	}
}
