// Command kbgen grows the multiple-choice question bank with the AI. It reads DATABASE_URL and the
// AI settings from the environment (or backend/.env), so running it against another environment's
// database fills that environment.
//
//	go run ./cmd/kbgen --topic nodejs --count 1000
//	go run ./cmd/kbgen --topic all --count 200 --concurrency 3
//
// It is safe to stop and run again: it only adds questions and skips duplicates.
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

	"pypr/backend/internal/config"
	"pypr/backend/internal/db"
	"pypr/backend/internal/mcq"
)

func main() {
	topic := flag.String("topic", "", `topic key or name (for example "nodejs" or "System design"), or "all"`)
	count := flag.Int("count", 1000, "grow each topic to this many questions")
	batch := flag.Int("batch", 15, "questions asked of the AI per request")
	conc := flag.Int("concurrency", 3, "requests in flight")
	list := flag.Bool("list", false, "list topic keys and exit")
	flag.Parse()

	if *list {
		for _, t := range mcq.AllTopics() {
			fmt.Printf("%-36s %s\n", t.Key, t.Area)
		}
		return
	}
	if *topic == "" {
		fmt.Fprintln(os.Stderr, "usage: kbgen --topic <key|name|all> [--count 1000] (see --list)")
		os.Exit(2)
	}
	if err := run(*topic, *count, *batch, *conc); err != nil {
		fmt.Fprintln(os.Stderr, "kbgen:", err)
		os.Exit(1)
	}
}

func run(topic string, count, batch, conc int) error {
	_ = godotenv.Load()
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	gen, err := mcq.NewGenerator(cfg.AIProvider, cfg.OpenRouterKey, cfg.OpenRouterModels)
	if err != nil {
		return err
	}
	if gen == nil {
		return fmt.Errorf("AI_PROVIDER is not set; the generator needs an AI provider")
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

	topics := mcq.AllTopics()
	if !strings.EqualFold(topic, "all") {
		t, ok := mcq.TopicByKeyOrName(topic)
		if !ok {
			return fmt.Errorf("unknown topic %q (see --list)", topic)
		}
		topics = []mcq.Topic{t}
	}
	log := slog.New(slog.NewTextHandler(os.Stdout, nil))
	for _, t := range topics {
		n, err := mcq.Generate(ctx, pool, gen, mcq.GenerateOptions{Topic: t, Target: count, Batch: batch, Concurrency: conc, Log: log.Info})
		fmt.Printf("%s: added %d\n", t.Key, n)
		if err != nil {
			return fmt.Errorf("%s: %w", t.Key, err)
		}
	}
	return nil
}
