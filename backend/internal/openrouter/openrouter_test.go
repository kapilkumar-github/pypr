package openrouter

import "testing"

func TestJSONObject(t *testing.T) {
	if got := jsonObject("```json\n{\"a\":1}\n```"); got != `{"a":1}` {
		t.Errorf("got %q", got)
	}
}
