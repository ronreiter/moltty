package config

import (
	"os"
	"strconv"
)

type Config struct {
	Port              string
	DatabaseURL       string
	JWTSecret         string
	ChiselServerURL   string
	GoogleClientID    string
	GoogleSecret      string
	GoogleRedirect    string
	SessionImage      string
	ScrollbackSize    int
	WorkerPingInterval int
}

func Load() *Config {
	return &Config{
		Port:               getEnv("PORT", "8082"),
		DatabaseURL:        getEnv("DATABASE_URL", "postgres://moltty:moltty_dev@localhost:5433/moltty?sslmode=disable"),
		JWTSecret:          getEnv("JWT_SECRET", "dev-secret-change-in-production"),
		ChiselServerURL:    getEnv("CHISEL_SERVER_URL", "http://localhost:8022"),
		GoogleClientID:     getEnv("GOOGLE_CLIENT_ID", ""),
		GoogleSecret:       getEnv("GOOGLE_CLIENT_SECRET", ""),
		GoogleRedirect:     getEnv("GOOGLE_REDIRECT_URL", "http://localhost:8080/api/auth/google/callback"),
		SessionImage:       getEnv("SESSION_IMAGE", "moltty-session:latest"),
		ScrollbackSize:     getEnvInt("SCROLLBACK_SIZE", 1024*1024),
		WorkerPingInterval: getEnvInt("WORKER_PING_INTERVAL", 30),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}
