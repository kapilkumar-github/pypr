package pdf

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/chromedp/chromedp"
)

const (
	renderTimeout = 20 * time.Second
	// maxConcurrent caps open tabs; each render holds one until it finishes.
	maxConcurrent = 3
	// readySelector is set by the web print page once fonts are loaded and the resume is laid out.
	readySelector = `html[data-pdf-ready]`
)

// Chrome renders with a local headless Chrome via the DevTools protocol.
// The browser starts on first use and restarts if it dies.
type Chrome struct {
	log  *slog.Logger
	sem  chan struct{}
	mu   sync.Mutex
	ctx  context.Context // browser context; one tab per render
	stop func()
}

func NewChrome(log *slog.Logger) *Chrome {
	return &Chrome{log: log, sem: make(chan struct{}, maxConcurrent)}
}

func (c *Chrome) browser() (context.Context, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.ctx != nil && c.ctx.Err() == nil {
		return c.ctx, nil
	}
	alloc, cancelAlloc := chromedp.NewExecAllocator(context.Background(),
		append(chromedp.DefaultExecAllocatorOptions[:], chromedp.Flag("hide-scrollbars", true))...)
	ctx, cancelCtx := chromedp.NewContext(alloc)
	if err := chromedp.Do(ctx); err != nil { // starts the browser; no timeout here, it would stop the browser
		cancelCtx()
		cancelAlloc()
		return nil, fmt.Errorf("start chrome: %w", err)
	}
	c.ctx, c.stop = ctx, func() { cancelCtx(); cancelAlloc() }
	c.log.Info("headless chrome started")
	return ctx, nil
}

func (c *Chrome) Render(ctx context.Context, url string) ([]byte, error) {
	select {
	case c.sem <- struct{}{}:
		defer func() { <-c.sem }()
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	browser, err := c.browser()
	if err != nil {
		return nil, err
	}
	limited, cancel := context.WithTimeout(browser, renderTimeout)
	defer cancel()
	// Stop waiting when the caller goes away.
	stopAfter := context.AfterFunc(ctx, cancel)
	defer stopAfter()
	tab, closeTab := chromedp.NewContext(limited)
	defer closeTab()

	if err := chromedp.Do(tab, chromedp.Navigate(url), chromedp.WaitReady(chromedp.CSS(readySelector))); err != nil {
		return nil, fmt.Errorf("load print page: %w", err)
	}
	// Tagged PDF keeps headings and reading order for applicant tracking software.
	out, err := chromedp.Run(tab, chromedp.PrintToPDF(chromedp.PDFPreferCSSPageSize(), chromedp.PDFPrintBackground(), chromedp.PDFOutlineAndTagged()))
	if errors.Is(err, context.DeadlineExceeded) {
		return nil, fmt.Errorf("render timed out: %w", err)
	}
	return out, err
}

func (c *Chrome) Close() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.stop != nil {
		c.stop()
		c.stop = nil
	}
}
