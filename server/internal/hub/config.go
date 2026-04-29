package hub

import "os"

const (
	defaultAddr   = "127.0.0.1:3331"
	defaultDBPath = "./data/probe.db"
)

type Config struct {
	Addr       string
	DBPath     string
	AdminToken string
}

func ConfigFromEnv() Config {
	return Config{
		Addr:       envOr("WIKI_PROBE_ADDR", defaultAddr),
		DBPath:     envOr("WIKI_PROBE_DB", defaultDBPath),
		AdminToken: os.Getenv("WIKI_ADMIN_TOKEN"),
	}
}

func envOr(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}
