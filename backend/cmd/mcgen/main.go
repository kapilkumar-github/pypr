// Command mcgen writes the machine coding bank (internal/machine/seeds.go) with the AI and keeps only problems whose
// reference solutions pass a real run on the code runner. Needs CODE_RUNNER=docker, the runner image (docker pull node:22-alpine),
// AI_PROVIDER=openrouter and DATABASE_URL (or backend/.env).
//
//	go run ./cmd/mcgen                 # every missing problem
//	go run ./cmd/mcgen --only rate-limiter
//
// Safe to stop and re-run: problems already stored are skipped.
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"sync"
	"time"

	"github.com/joho/godotenv"

	"pypr/backend/internal/config"
	"pypr/backend/internal/db"
	"pypr/backend/internal/machine"
	"pypr/backend/internal/openrouter"
	"pypr/backend/internal/runner"
)

func main() {
	only := flag.String("only", "", "write just this slug")
	conc := flag.Int("concurrency", 2, "problems written and checked at once")
	repairs := flag.Int("repairs", 3, "how many times to ask the model to fix a rejected draft")
	flag.Parse()
	if err := run(*only, *conc, *repairs); err != nil {
		fmt.Fprintln(os.Stderr, "mcgen:", err)
		os.Exit(1)
	}
}

func run(only string, conc, repairs int) error {
	_ = godotenv.Load()
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	if cfg.AIProvider != "openrouter" || cfg.OpenRouterKey == "" {
		return fmt.Errorf("set AI_PROVIDER=openrouter and OPENROUTER_API_KEY")
	}
	if cfg.CodeRunner != "docker" {
		return fmt.Errorf("set CODE_RUNNER=docker")
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	pool, err := db.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	d := runner.NewDocker(cfg.CodeRunnerImage)
	if err := d.Ensure(ctx); err != nil {
		return err
	}
	writer := machine.OpenRouterWriter{Client: openrouter.New(cfg.OpenRouterKey, cfg.OpenRouterModels).WithTimeout(8 * time.Minute)}
	log := slog.New(slog.NewTextHandler(os.Stdout, nil))

	var todo []machine.Seed
	for _, s := range machine.Seeds {
		if only != "" && s.Slug != only {
			continue
		}
		var n int
		if err := pool.QueryRow(ctx, `select count(*) from mc_problems where slug = $1`, s.Slug).Scan(&n); err != nil {
			return err
		}
		if n == 0 {
			todo = append(todo, s)
		}
	}
	if only != "" && len(todo) == 0 {
		return fmt.Errorf("%q is unknown or already stored", only)
	}
	var (
		wg      sync.WaitGroup
		mu      sync.Mutex
		added   int
		failed  []string
		pending = make(chan machine.Seed)
	)
	for range max(conc, 1) {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for s := range pending {
				ok, err := machine.Generate(ctx, pool, writer, d, s, repairs, log.Info)
				mu.Lock()
				if err != nil {
					failed = append(failed, s.Slug)
					log.Error("discarded", "slug", s.Slug, "err", err)
				} else if ok {
					added++
					log.Info("added", "slug", s.Slug)
				}
				mu.Unlock()
			}
		}()
	}
	for _, s := range todo {
		select {
		case pending <- s:
		case <-ctx.Done():
		}
	}
	close(pending)
	wg.Wait()
	fmt.Printf("added %d of %d; discarded: %v\n", added, len(todo), failed)
	return nil
}
