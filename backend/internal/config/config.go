package config

import (
	"errors"
	"os"
	"strconv"
)

type Config struct {
	DatabaseURL   string
	Addr          string
	AppURL        string
	CookieSecure  bool
	EmailProvider string
	PDFProvider   string
	// ChromeNoSandbox runs Chrome without its sandbox: needed inside a container that drops all capabilities.
	ChromeNoSandbox bool
}

func Load() (Config, error) {
	c := Config{
		DatabaseURL:   os.Getenv("DATABASE_URL"),
		Addr:          envOr("ADDR", ":8080"),
		AppURL:        envOr("APP_URL", "http://localhost:3000"),
		EmailProvider: envOr("EMAIL_PROVIDER", "log"),
		PDFProvider:   envOr("PDF_PROVIDER", "chrome"),
	}
	if c.DatabaseURL == "" {
		return c, errors.New("DATABASE_URL is required")
	}
	secure, err := strconv.ParseBool(envOr("COOKIE_SECURE", "false"))
	if err != nil {
		return c, errors.New("COOKIE_SECURE must be true or false")
	}
	c.CookieSecure = secure
	noSandbox, err := strconv.ParseBool(envOr("CHROME_NO_SANDBOX", "false"))
	if err != nil {
		return c, errors.New("CHROME_NO_SANDBOX must be true or false")
	}
	c.ChromeNoSandbox = noSandbox
	return c, nil
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
