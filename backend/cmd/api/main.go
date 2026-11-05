package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"

	"pypr/backend/internal/auth"
	"pypr/backend/internal/config"
	"pypr/backend/internal/db"
	"pypr/backend/internal/email"
	"pypr/backend/internal/pdf"
	"pypr/backend/internal/resumeparse"
	"pypr/backend/internal/server"
)

func main() {
	log := slog.New(slog.NewTextHandler(os.Stdout, nil))
	if err := run(log); err != nil {
		log.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	_ = godotenv.Load() // optional .env for local development
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := db.Migrate(ctx, cfg.DatabaseURL); err != nil {
		return err
	}
	pool, err := db.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	mailer, err := email.New(cfg.EmailProvider, log, cfg.ResendAPIKey, cfg.EmailFrom)
	if err != nil {
		return err
	}
	authSvc, err := auth.NewService(auth.PGStore{DB: pool}, mailer, cfg.AppURL, log)
	if err != nil {
		return err
	}

	renderer, err := pdf.New(cfg.PDFProvider, cfg.ChromeNoSandbox, log)
	if err != nil {
		return err
	}
	defer renderer.Close()
	parser, err := resumeparse.New(cfg.ResumeParser, cfg.OpenRouterKey, cfg.OpenRouterModels)
	if err != nil {
		return err
	}

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           server.New(log, pool, authSvc, renderer, parser, cfg.CookieSecure, cfg.AppURL),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	errCh := make(chan error, 1)
	go func() {
		log.Info("listening", "addr", cfg.Addr)
		errCh <- srv.ListenAndServe()
	}()

	select {
	case err := <-errCh:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
		log.Info("shutting down")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return srv.Shutdown(shutdownCtx)
	}
	return nil
}
