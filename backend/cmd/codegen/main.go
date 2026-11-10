// Command codegen grows the coding-problem bank with the AI and keeps only problems that pass a real run.
// Browser problems (JavaScript, HTML + CSS) need the web app running (APP_URL, dev: http://localhost:3000): the check loads
// its /code-verify page in headless Chrome. Server problems (Node.js, TypeScript, DSA) need CODE_RUNNER=docker and the runner image (docker pull node:22-alpine).
//
//	go run ./cmd/codegen --topic nodejs --count 40
//	go run ./cmd/codegen --topic all --count 30
//
// It reads DATABASE_URL and the AI settings from the environment (or backend/.env). Safe to stop and re-run.
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"strings"

	"github.com/joho/godotenv"

	"pypr/backend/internal/codeprob"
	"pypr/backend/internal/config"
	"pypr/backend/internal/db"
	"pypr/backend/internal/mcq"
	"pypr/backend/internal/openrouter"
	"pypr/backend/internal/runner"
)

func main() {
	topic := flag.String("topic", "", `topic key or name (for example "nodejs"), or "all"`)
	count := flag.Int("count", 40, "grow each topic to this many problems")
	conc := flag.Int("concurrency", 3, "problems written and checked at once")
	flag.Parse()
	if *topic == "" {
		fmt.Fprintln(os.Stderr, "usage: codegen --topic <key|name|all> [--count 40]")
		for _, s := range codeprob.Specs {
			fmt.Fprintf(os.Stderr, "  %-34s %s (%s, %s)\n", s.Topic, s.Kind, s.Language, s.Runner)
		}
		os.Exit(2)
	}
	if err := run(*topic, *count, *conc); err != nil {
		fmt.Fprintln(os.Stderr, "codegen:", err)
		os.Exit(1)
	}
}

func run(topic string, count, conc int) error {
	_ = godotenv.Load()
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	if cfg.AIProvider != "openrouter" || cfg.OpenRouterKey == "" {
		return fmt.Errorf("set AI_PROVIDER=openrouter and OPENROUTER_API_KEY")
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	pool, err := db.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	if err := mcq.Sync(ctx, pool); err != nil {
		return err
	}
	writer := codeprob.OpenRouter{Client: openrouter.New(cfg.OpenRouterKey, cfg.OpenRouterModels)}

	var specs []codeprob.Spec
	if strings.EqualFold(topic, "all") {
		specs = codeprob.Specs
	} else {
		t, ok := mcq.TopicByKeyOrName(topic)
		if !ok {
			return fmt.Errorf("unknown topic %q", topic)
		}
		s, ok := codeprob.SpecFor(t.Key, "")
		if !ok {
			return fmt.Errorf("topic %s has no coding problems yet", t.Key)
		}
		specs = []codeprob.Spec{s}
	}
	// Browser problems are checked in headless Chrome, server problems with the code runner. Each is started only when needed.
	var verifier codeprob.Router
	for _, s := range specs {
		switch {
		case s.Runner == codeprob.RunnerBrowser && verifier.Browser == nil:
			chrome, err := codeprob.NewChrome(ctx, cfg.AppURL, cfg.ChromeNoSandbox)
			if err != nil {
				return err
			}
			defer chrome.Close()
			verifier.Browser = chrome
		case s.Runner == codeprob.RunnerServer && verifier.Server == nil:
			if cfg.CodeRunner != "docker" {
				return fmt.Errorf("set CODE_RUNNER=docker to generate %s problems", s.Topic)
			}
			d := runner.NewDocker(cfg.CodeRunnerImage)
			if err := d.Ensure(ctx); err != nil {
				return err
			}
			verifier.Server = codeprob.ServerVerifier{Runner: d}
		}
	}
	log := slog.New(slog.NewTextHandler(os.Stdout, nil))
	for _, s := range specs {
		t, _ := mcq.TopicByKeyOrName(s.Topic)
		n, err := codeprob.Generate(ctx, pool, writer, verifier, codeprob.Options{Spec: s, TopicName: t.Name, Target: count, Concurrency: conc, Log: log.Info})
		fmt.Printf("%s: added %d\n", s.Topic, n)
		if err != nil {
			return fmt.Errorf("%s: %w", s.Topic, err)
		}
	}
	return nil
}
