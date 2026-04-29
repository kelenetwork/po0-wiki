package main

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type client struct {
	baseURL string
	token   string
	http    *http.Client
}

func newClient(cfg Config) *client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	if cfg.InsecureSkipVerify {
		transport.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}
	}
	return &client{
		baseURL: cfg.HubURL,
		token:   cfg.Token,
		http:    &http.Client{Timeout: 15 * time.Second, Transport: transport},
	}
}

func (c *client) poll(ctx context.Context, agentID, version, hostname string) ([]Check, error) {
	var out struct {
		Checks []Check `json:"checks"`
	}
	err := c.post(ctx, "/poll", map[string]string{"agent_id": agentID, "version": version, "hostname": hostname}, &out)
	return out.Checks, err
}

func (c *client) report(ctx context.Context, agentID string, results []Result) (int, error) {
	var out struct {
		Accepted int `json:"accepted"`
	}
	err := c.post(ctx, "/report", map[string]any{"agent_id": agentID, "results": results}, &out)
	return out.Accepted, err
}

func (c *client) post(ctx context.Context, path string, body any, out any) error {
	payload, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("hub returned HTTP %d: %s", resp.StatusCode, string(data))
	}
	if err := json.Unmarshal(data, out); err != nil {
		return fmt.Errorf("decode hub response: %w", err)
	}
	return nil
}
