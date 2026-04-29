package main

import (
	"context"
	"flag"
	"log"
	"os"
	"sync"
	"time"
)

const version = "v0.2.0"

func main() {
	configPath := flag.String("config", "/etc/wiki-probe-agent.json", "path to JSON config")
	flag.Parse()
	cfg, err := loadConfig(*configPath)
	if err != nil {
		log.Fatalf("load config: %v", err)
	}
	hostname, _ := os.Hostname()
	agent := &runner{
		cfg:      cfg,
		client:   newClient(cfg),
		hostname: hostname,
		checks:   map[string]Check{},
	}
	agent.run(context.Background())
}

type runner struct {
	cfg      Config
	client   *client
	hostname string
	mu       sync.RWMutex
	checks   map[string]Check
}

func (r *runner) run(ctx context.Context) {
	pollInterval := time.Duration(r.cfg.PollIntervalSeconds) * time.Second
	reportInterval := time.Duration(r.cfg.ReportIntervalSeconds) * time.Second
	_ = r.poll(ctx)
	r.pollLG(ctx)
	probeTicker := time.NewTicker(time.Second)
	lgTicker := time.NewTicker(time.Second)
	reportTicker := time.NewTicker(reportInterval)
	pollTicker := time.NewTicker(pollInterval)
	defer probeTicker.Stop()
	defer lgTicker.Stop()
	defer reportTicker.Stop()
	defer pollTicker.Stop()
	var pending []Result
	lastRun := map[string]time.Time{}
	for {
		select {
		case <-ctx.Done():
			return
		case <-pollTicker.C:
			_ = r.poll(ctx)
		case <-probeTicker.C:
			for _, check := range r.currentChecks() {
				interval := check.IntervalSeconds
				if interval <= 0 {
					interval = 30
				}
				if time.Since(lastRun[check.CheckID]) < time.Duration(interval)*time.Second {
					continue
				}
				lastRun[check.CheckID] = time.Now()
				pending = append(pending, probeCheck(ctx, check, time.Duration(r.cfg.TCPTimeoutMS)*time.Millisecond, r.cfg.InsecureSkipVerify))
			}
		case <-reportTicker.C:
			if len(pending) == 0 {
				continue
			}
			if r.reportWithRetry(ctx, pending) {
				pending = nil
			} else {
				log.Printf("dropping %d results after retries", len(pending))
				pending = nil
			}
		}
	}
}

func (r *runner) poll(ctx context.Context) error {
	checks, err := r.client.poll(ctx, r.cfg.AgentID, version, r.hostname)
	if err != nil {
		log.Printf("poll failed: %v", err)
		return err
	}
	next := map[string]Check{}
	for _, check := range checks {
		kind := normalizeCheckKind(check.Kind)
		if check.CheckID == "" || check.Host == "" {
			continue
		}
		if kind != "icmp" && check.Port <= 0 {
			continue
		}
		check.Kind = kind
		next[check.CheckID] = check
	}
	r.mu.Lock()
	r.checks = next
	r.mu.Unlock()
	log.Printf("poll ok: %d checks", len(next))
	return nil
}

func (r *runner) currentChecks() []Check {
	r.mu.RLock()
	defer r.mu.RUnlock()
	checks := make([]Check, 0, len(r.checks))
	for _, check := range r.checks {
		checks = append(checks, check)
	}
	return checks
}

func (r *runner) reportWithRetry(ctx context.Context, results []Result) bool {
	backoff := time.Second
	for attempt := 1; attempt <= 3; attempt++ {
		accepted, err := r.client.report(ctx, r.cfg.AgentID, results)
		if err == nil {
			log.Printf("report ok: accepted=%d", accepted)
			return true
		}
		log.Printf("report attempt %d failed: %v", attempt, err)
		select {
		case <-ctx.Done():
			return false
		case <-time.After(backoff):
		}
		backoff *= 2
	}
	return false
}

func (r *runner) pollLG(ctx context.Context) {
	job, err := r.client.pollLGJob(ctx, r.cfg.AgentID)
	if err != nil {
		log.Printf("lg poll failed: %v", err)
		return
	}
	if job == nil || job.ID == "" {
		return
	}
	log.Printf("lg job start: id=%s tool=%s target=%s", job.ID, job.Tool, job.TargetID)
	output, errorText := runLGJob(ctx, *job)
	if err := r.client.reportLGJob(ctx, r.cfg.AgentID, job.ID, output, errorText); err != nil {
		log.Printf("lg report failed: id=%s error=%v", job.ID, err)
		return
	}
	if errorText != "" {
		log.Printf("lg job failed: id=%s error=%s", job.ID, errorText)
		return
	}
	log.Printf("lg job completed: id=%s", job.ID)
}
