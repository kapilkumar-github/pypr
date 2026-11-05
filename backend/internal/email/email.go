// Package email is the port for outgoing mail. Domain code depends on Sender only.
package email

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
)

type Message struct {
	To      string
	Subject string
	Text    string
}

type Sender interface {
	Send(ctx context.Context, m Message) error
}

// New selects an adapter by provider name. "resend" needs an API key and a from address.
func New(provider string, log *slog.Logger, resendKey, from string) (Sender, error) {
	switch provider {
	case "log":
		return LogSender{Log: log}, nil
	case "resend":
		if resendKey == "" || from == "" {
			return nil, fmt.Errorf("EMAIL_PROVIDER=resend needs RESEND_API_KEY and EMAIL_FROM")
		}
		return NewResend(resendKey, from), nil
	default:
		return nil, fmt.Errorf("unknown EMAIL_PROVIDER %q", provider)
	}
}

// LogSender is the development adapter: it writes emails to the log instead of sending them.
type LogSender struct{ Log *slog.Logger }

func (s LogSender) Send(_ context.Context, m Message) error {
	s.Log.Info("email (not sent, log adapter)", "to", m.To, "subject", m.Subject, "body", m.Text)
	return nil
}

// Fake records messages for tests.
type Fake struct {
	mu   sync.Mutex
	Sent []Message
}

func (f *Fake) Send(_ context.Context, m Message) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.Sent = append(f.Sent, m)
	return nil
}

func (f *Fake) Last() (Message, bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.Sent) == 0 {
		return Message{}, false
	}
	return f.Sent[len(f.Sent)-1], true
}
