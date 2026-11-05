// Package openrouter calls chat models on OpenRouter and decodes their JSON replies.
package openrouter

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const chatURL = "https://openrouter.ai/api/v1/chat/completions"

// DefaultModels are free OpenRouter models with JSON output, tried in order (OpenRouter falls back on errors).
var DefaultModels = []string{"google/gemma-4-31b-it:free", "nvidia/nemotron-3.5-super-vl:free"}

type Client struct {
	key    string
	models []string
	http   *http.Client
}

func New(key string, models []string) *Client {
	if len(models) == 0 {
		models = DefaultModels
	}
	return &Client{key: key, models: models, http: &http.Client{Timeout: 100 * time.Second}}
}

// Request is one chat call: a system prompt, the user message parts and optional plugins.
type Request struct {
	System  string
	User    []map[string]any
	Plugins []any
}

// ChatJSON sends req and decodes the model's JSON object reply into dst.
func (c *Client) ChatJSON(ctx context.Context, req Request, dst any) error {
	payload := map[string]any{
		"models": c.models,
		"messages": []map[string]any{
			{"role": "system", "content": req.System},
			{"role": "user", "content": req.User},
		},
		"response_format": map[string]any{"type": "json_object"},
		"temperature":     0,
	}
	if len(req.Plugins) > 0 {
		payload["plugins"] = req.Plugins
	}
	body, _ := json.Marshal(payload)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, chatURL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	httpReq.Header.Set("Authorization", "Bearer "+c.key)
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("X-Title", "pypr")
	res, err := c.http.Do(httpReq)
	if err != nil {
		return fmt.Errorf("openrouter: %w", err)
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if err != nil {
		return fmt.Errorf("openrouter: %w", err)
	}
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("openrouter: status %d: %s", res.StatusCode, truncate(raw, 300))
	}
	var out struct {
		Model   string `json:"model"`
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return fmt.Errorf("openrouter: decode: %w", err)
	}
	if out.Error != nil {
		return fmt.Errorf("openrouter: %s", out.Error.Message)
	}
	if len(out.Choices) == 0 {
		return errors.New("openrouter: no choices")
	}
	if err := json.Unmarshal([]byte(jsonObject(out.Choices[0].Message.Content)), dst); err != nil {
		return fmt.Errorf("openrouter: model %s returned invalid JSON: %w", out.Model, err)
	}
	return nil
}

// TextPart wraps untrusted text in a tag the system prompt can point at, capped at maxChars.
func TextPart(tag, text string, maxChars int) map[string]any {
	if len(text) > maxChars {
		text = text[:maxChars]
	}
	return map[string]any{"type": "text", "text": "<" + tag + ">\n" + text + "\n</" + tag + ">"}
}

// jsonObject strips code fences or prose around the first {...} block some models add.
func jsonObject(s string) string {
	start, end := strings.Index(s, "{"), strings.LastIndex(s, "}")
	if start < 0 || end < start {
		return s
	}
	return s[start : end+1]
}

func truncate(b []byte, n int) string {
	if len(b) > n {
		b = b[:n]
	}
	return string(b)
}
