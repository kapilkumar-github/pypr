// Package pdf is the port for turning a web page into a PDF. Domain code depends on Renderer only.
package pdf

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
)

type Renderer interface {
	// Render loads url, waits for the page to mark itself ready and prints it with the page's own @page size and margins.
	Render(ctx context.Context, url string) ([]byte, error)
	Close()
}

// New selects an adapter by provider name.
func New(provider string, log *slog.Logger) (Renderer, error) {
	switch provider {
	case "chrome":
		return NewChrome(log), nil
	default:
		return nil, fmt.Errorf("unknown PDF_PROVIDER %q", provider)
	}
}

// Fake records rendered URLs for tests and returns a fixed document.
type Fake struct {
	mu   sync.Mutex
	URLs []string
}

func (f *Fake) Render(_ context.Context, url string) ([]byte, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.URLs = append(f.URLs, url)
	return []byte("%PDF-1.7 fake"), nil
}

func (f *Fake) Close() {}
