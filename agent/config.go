package main

import (
	"encoding/json"
	"errors"
	"os"
	"strings"
)

func loadConfig(path string) (Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Config{}, err
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return Config{}, err
	}
	cfg.HubURL = strings.TrimRight(cfg.HubURL, "/")
	if cfg.AgentID == "" || cfg.HubURL == "" || cfg.Token == "" {
		return Config{}, errors.New("agent_id, hub_url, and token are required")
	}
	if cfg.PollIntervalSeconds <= 0 {
		cfg.PollIntervalSeconds = 300
	}
	if cfg.ReportIntervalSeconds <= 0 {
		cfg.ReportIntervalSeconds = 30
	}
	if cfg.TCPTimeoutMS <= 0 {
		cfg.TCPTimeoutMS = 3000
	}
	return cfg, nil
}
