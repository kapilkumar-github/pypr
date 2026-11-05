package email

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const resendURL = "https://api.resend.com/emails"

// ResendSender sends through the Resend API. From must be on a domain verified in Resend.
type ResendSender struct {
	APIKey string
	From   string
	HTTP   *http.Client
}

func NewResend(apiKey, from string) *ResendSender {
	return &ResendSender{APIKey: apiKey, From: from, HTTP: &http.Client{Timeout: 15 * time.Second}}
}

func (s *ResendSender) Send(ctx context.Context, m Message) error {
	body, err := json.Marshal(map[string]any{"from": s.From, "to": []string{m.To}, "subject": m.Subject, "text": m.Text})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, resendURL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+s.APIKey)
	req.Header.Set("Content-Type", "application/json")
	res, err := s.HTTP.Do(req)
	if err != nil {
		return fmt.Errorf("resend: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		msg, _ := io.ReadAll(io.LimitReader(res.Body, 512))
		return fmt.Errorf("resend: status %d: %s", res.StatusCode, msg)
	}
	return nil
}
