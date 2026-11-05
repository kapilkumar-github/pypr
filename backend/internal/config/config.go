package config

import (
	"errors"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	DatabaseURL   string
	Addr          string
	AppURL        string
	CookieSecure  bool
	EmailProvider string
	ResendAPIKey  string
	EmailFrom     string
	PDFProvider   string
	// ChromeNoSandbox runs Chrome without its sandbox: needed inside a container that drops all capabilities.
	ChromeNoSandbox bool
	// AI features (resume upload, job analysis): provider "openrouter" or "none".
	AIProvider       string
	OpenRouterKey    string
	OpenRouterModels []string
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
	c.ResendAPIKey = os.Getenv("RESEND_API_KEY")
	c.EmailFrom = os.Getenv("EMAIL_FROM")
	// RESUME_PARSER_PROVIDER is the old name, still read so existing env files keep working.
	c.AIProvider = envOr("AI_PROVIDER", envOr("RESUME_PARSER_PROVIDER", "none"))
	c.OpenRouterKey = os.Getenv("OPENROUTER_API_KEY")
	for _, m := range strings.Split(os.Getenv("OPENROUTER_MODELS"), ",") {
		if m = strings.TrimSpace(m); m != "" {
			c.OpenRouterModels = append(c.OpenRouterModels, m)
		}
	}
	return c, nil
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
