package resume

import (
	"strings"
	"testing"
	"time"
)

func TestRenderTokens(t *testing.T) {
	tokens := newRenderTokens()
	now := time.Unix(1_800_000_000, 0)
	tok := tokens.sign(renderClaim{ResumeID: "r1", HideContact: true, Expires: now.Add(time.Minute)})

	c, ok := tokens.verify(tok, now)
	if !ok || c.ResumeID != "r1" || !c.HideContact {
		t.Fatalf("valid token rejected: %+v %v", c, ok)
	}
	if _, ok := tokens.verify(tok, now.Add(2*time.Minute)); ok {
		t.Error("expired token accepted")
	}
	if _, ok := newRenderTokens().verify(tok, now); ok {
		t.Error("token from another key accepted")
	}
	payload, sig, _ := strings.Cut(tok, ".")
	forged := tokens.sign(renderClaim{ResumeID: "r2", Expires: now.Add(time.Minute)})
	forgedPayload, _, _ := strings.Cut(forged, ".")
	if _, ok := tokens.verify(forgedPayload+"."+sig, now); ok {
		t.Error("swapped payload accepted")
	}
	for _, bad := range []string{"", "x", payload, payload + ".", "." + sig} {
		if _, ok := tokens.verify(bad, now); ok {
			t.Errorf("malformed token %q accepted", bad)
		}
	}
}
