package hub

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"time"

	_ "modernc.org/sqlite"
)

type Store struct {
	db *sql.DB
}

type Source struct {
	ID          string   `json:"id"`
	DisplayName string   `json:"display_name"`
	Region      string   `json:"region"`
	Tags        []string `json:"tags"`
	Status      string   `json:"status"`
	UpdatedAt   string   `json:"updated_at"`
}

type Target struct {
	ID          string   `json:"id"`
	DisplayName string   `json:"display_name"`
	Region      string   `json:"region"`
	Tags        []string `json:"tags"`
	Status      string   `json:"status"`
	UpdatedAt   string   `json:"updated_at"`
}

type Check struct {
	ID          string   `json:"id"`
	DisplayName string   `json:"display_name"`
	SourceID    string   `json:"source_id"`
	TargetID    string   `json:"target_id"`
	Tags        []string `json:"tags"`
	Status      string   `json:"status"`
	LatencyMS   float64  `json:"latency_ms"`
	LossPct     float64  `json:"loss_pct"`
	JitterMS    float64  `json:"jitter_ms"`
	UpdatedAt   string   `json:"updated_at"`
}

type SeriesPoint struct {
	UpdatedAt string  `json:"updated_at"`
	LatencyMS float64 `json:"latency_ms"`
	LossPct   float64 `json:"loss_pct"`
	JitterMS  float64 `json:"jitter_ms"`
}

type SeriesSummary struct {
	CheckID string        `json:"check_id"`
	Points  []SeriesPoint `json:"points"`
}

type Snapshot struct {
	Sources []Source        `json:"sources"`
	Targets []Target        `json:"targets"`
	Checks  []Check         `json:"checks"`
	Series  []SeriesSummary `json:"series"`
}

type CreateSourceRequest struct {
	ID          string   `json:"id"`
	DisplayName string   `json:"display_name"`
	Region      string   `json:"region"`
	Tags        []string `json:"tags"`
	Status      string   `json:"status"`
	Endpoint    string   `json:"endpoint"`
}

type CreateTargetRequest struct {
	ID          string   `json:"id"`
	DisplayName string   `json:"display_name"`
	Region      string   `json:"region"`
	Tags        []string `json:"tags"`
	Status      string   `json:"status"`
	Endpoint    string   `json:"endpoint"`
}

type CreateCheckRequest struct {
	ID              string   `json:"id"`
	DisplayName     string   `json:"display_name"`
	SourceID        string   `json:"source_id"`
	TargetID        string   `json:"target_id"`
	Tags            []string `json:"tags"`
	Status          string   `json:"status"`
	LatencyMS       float64  `json:"latency_ms"`
	LossPct         float64  `json:"loss_pct"`
	JitterMS        float64  `json:"jitter_ms"`
	IntervalSeconds int      `json:"interval_seconds"`
}

type Agent struct {
	ID             string `json:"id"`
	SourceID       string `json:"source_id"`
	TokenPrefix    string `json:"token_prefix"`
	CreatedAt      string `json:"created_at"`
	LastSeenAt     string `json:"last_seen_at,omitempty"`
	LastReportedAt string `json:"last_reported_at,omitempty"`
	Version        string `json:"version,omitempty"`
	Hostname       string `json:"hostname,omitempty"`
}

type CreateAgentRequest struct {
	ID string `json:"id"`
}

type CreateAgentResponse struct {
	Agent Agent  `json:"agent"`
	Token string `json:"token"`
}

type AgentCheck struct {
	CheckID         string `json:"check_id"`
	DisplayName     string `json:"display_name"`
	Host            string `json:"host"`
	Port            int    `json:"port"`
	IntervalSeconds int    `json:"interval_seconds"`
}

type AgentResult struct {
	CheckID      string  `json:"check_id"`
	TCPConnectMS float64 `json:"tcp_connect_ms"`
	Loss         float64 `json:"loss"`
	JitterMS     float64 `json:"jitter_ms"`
	Status       string  `json:"status"`
	ObservedAt   string  `json:"observed_at"`
	Error        string  `json:"error,omitempty"`
}

func OpenStore(dbPath string) (*Store, error) {
	if dbPath == "" {
		dbPath = defaultDBPath
	}
	if dbPath != ":memory:" {
		if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
			return nil, fmt.Errorf("create database directory: %w", err)
		}
	}
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	return &Store{db: db}, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) Migrate(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  region TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL,
  endpoint TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS targets (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  region TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL,
  endpoint TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS checks (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  source_id TEXT NOT NULL REFERENCES sources(id),
  target_id TEXT NOT NULL REFERENCES targets(id),
  tags TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  loss_pct REAL NOT NULL DEFAULT 0,
  jitter_ms INTEGER NOT NULL DEFAULT 0,
  interval_seconds INTEGER NOT NULL DEFAULT 30,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS series_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  check_id TEXT NOT NULL REFERENCES checks(id),
  latency_ms REAL NOT NULL,
  loss_pct REAL NOT NULL,
  jitter_ms REAL NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY REFERENCES sources(id),
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL DEFAULT '',
  last_reported_at TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL DEFAULT '',
  hostname TEXT NOT NULL DEFAULT ''
);
`)
	if err != nil {
		return err
	}
	_, _ = s.db.ExecContext(ctx, `ALTER TABLE checks ADD COLUMN interval_seconds INTEGER NOT NULL DEFAULT 30`)
	return nil
}

func (s *Store) SeedDemo(ctx context.Context) error {
	var count int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM sources`).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	now := time.Now().UTC().Truncate(time.Second)
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	sources := []CreateSourceRequest{
		{ID: "src-shanghai-ctc", DisplayName: "上海电信入口", Region: "华东", Tags: []string{"CTC", "CN2", "出站探测"}, Status: "pending", Endpoint: "probe-a.example.test:443"},
		{ID: "src-rfc-ctc", DisplayName: "RFC CTC", Region: "华南", Tags: []string{"CTC", "BGP", "备用线路"}, Status: "pending", Endpoint: "probe-b.example.test:443"},
		{ID: "src-cn-a", DisplayName: "CN-A 采集点", Region: "华北", Tags: []string{"Multi-ISP", "联通", "移动观测"}, Status: "pending", Endpoint: "probe-c.example.test:443"},
	}
	targets := []CreateTargetRequest{
		{ID: "tgt-wiki", DisplayName: "Wiki 主站", Region: "边缘入口", Tags: []string{"HTTPS", "站点可用性"}, Status: "online", Endpoint: "docs.example.test:443"},
		{ID: "tgt-api", DisplayName: "API 入口", Region: "中心端", Tags: []string{"HTTPS", "控制面"}, Status: "online", Endpoint: "api.example.test:443"},
	}
	checks := []CreateCheckRequest{
		{ID: "chk-shanghai-wiki", DisplayName: "上海电信 → Wiki 主站", SourceID: "src-shanghai-ctc", TargetID: "tgt-wiki", Tags: []string{"HTTPS"}, Status: "pending", LatencyMS: 0, LossPct: 0, JitterMS: 0},
		{ID: "chk-rfc-wiki", DisplayName: "RFC CTC → Wiki 主站", SourceID: "src-rfc-ctc", TargetID: "tgt-wiki", Tags: []string{"HTTPS"}, Status: "pending", LatencyMS: 0, LossPct: 0, JitterMS: 0},
		{ID: "chk-cn-a-api", DisplayName: "CN-A → API 入口", SourceID: "src-cn-a", TargetID: "tgt-api", Tags: []string{"HTTPS"}, Status: "pending", LatencyMS: 0, LossPct: 0, JitterMS: 0},
	}

	for _, source := range sources {
		if err := insertSource(ctx, tx, source, now.Format(time.RFC3339)); err != nil {
			return err
		}
	}
	for _, target := range targets {
		if err := insertTarget(ctx, tx, target, now.Format(time.RFC3339)); err != nil {
			return err
		}
	}
	for index, check := range checks {
		updated := now.Add(time.Duration(index) * time.Second).Format(time.RFC3339)
		if err := insertCheck(ctx, tx, check, updated); err != nil {
			return err
		}
		for point := 2; point >= 0; point-- {
			_, err := tx.ExecContext(ctx, `INSERT INTO series_points (check_id, latency_ms, loss_pct, jitter_ms, updated_at) VALUES (?, ?, ?, ?, ?)`,
				check.ID, check.LatencyMS-float64(point*3), check.LossPct, check.JitterMS+float64(point), now.Add(-time.Duration(point)*time.Minute).Format(time.RFC3339))
			if err != nil {
				return err
			}
		}
	}

	return tx.Commit()
}

func (s *Store) Snapshot(ctx context.Context) (Snapshot, error) {
	sources, err := s.ListSources(ctx)
	if err != nil {
		return Snapshot{}, err
	}
	targets, err := s.ListTargets(ctx)
	if err != nil {
		return Snapshot{}, err
	}
	checks, err := s.ListChecks(ctx)
	if err != nil {
		return Snapshot{}, err
	}
	series, err := s.ListSeriesSummary(ctx)
	if err != nil {
		return Snapshot{}, err
	}
	return Snapshot{Sources: sources, Targets: targets, Checks: checks, Series: series}, nil
}

func (s *Store) ListSources(ctx context.Context) ([]Source, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, display_name, region, tags, status, updated_at FROM sources ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var sources []Source
	for rows.Next() {
		var source Source
		var tags string
		if err := rows.Scan(&source.ID, &source.DisplayName, &source.Region, &tags, &source.Status, &source.UpdatedAt); err != nil {
			return nil, err
		}
		source.Tags = decodeTags(tags)
		sources = append(sources, source)
	}
	return sources, rows.Err()
}

func (s *Store) ListTargets(ctx context.Context) ([]Target, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, display_name, region, tags, status, updated_at FROM targets ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var targets []Target
	for rows.Next() {
		var target Target
		var tags string
		if err := rows.Scan(&target.ID, &target.DisplayName, &target.Region, &tags, &target.Status, &target.UpdatedAt); err != nil {
			return nil, err
		}
		target.Tags = decodeTags(tags)
		targets = append(targets, target)
	}
	return targets, rows.Err()
}

func (s *Store) ListChecks(ctx context.Context) ([]Check, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, display_name, source_id, target_id, tags, status, latency_ms, loss_pct, jitter_ms, updated_at FROM checks ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var checks []Check
	for rows.Next() {
		var check Check
		var tags string
		if err := rows.Scan(&check.ID, &check.DisplayName, &check.SourceID, &check.TargetID, &tags, &check.Status, &check.LatencyMS, &check.LossPct, &check.JitterMS, &check.UpdatedAt); err != nil {
			return nil, err
		}
		check.Tags = decodeTags(tags)
		checks = append(checks, check)
	}
	return checks, rows.Err()
}

func (s *Store) ListSeriesSummary(ctx context.Context) ([]SeriesSummary, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT check_id, latency_ms, loss_pct, jitter_ms, updated_at FROM series_points ORDER BY check_id, updated_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	byCheck := make(map[string][]SeriesPoint)
	var order []string
	for rows.Next() {
		var checkID string
		var point SeriesPoint
		if err := rows.Scan(&checkID, &point.LatencyMS, &point.LossPct, &point.JitterMS, &point.UpdatedAt); err != nil {
			return nil, err
		}
		if _, ok := byCheck[checkID]; !ok {
			order = append(order, checkID)
		}
		byCheck[checkID] = append(byCheck[checkID], point)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	series := make([]SeriesSummary, 0, len(order))
	for _, checkID := range order {
		series = append(series, SeriesSummary{CheckID: checkID, Points: byCheck[checkID]})
	}
	return series, nil
}

func (s *Store) CreateSource(ctx context.Context, req CreateSourceRequest) (Source, error) {
	now := time.Now().UTC().Truncate(time.Second).Format(time.RFC3339)
	if err := insertSource(ctx, s.db, req, now); err != nil {
		return Source{}, err
	}
	return Source{ID: req.ID, DisplayName: req.DisplayName, Region: req.Region, Tags: req.Tags, Status: defaultStatus(req.Status), UpdatedAt: now}, nil
}

func (s *Store) CreateTarget(ctx context.Context, req CreateTargetRequest) (Target, error) {
	now := time.Now().UTC().Truncate(time.Second).Format(time.RFC3339)
	if err := insertTarget(ctx, s.db, req, now); err != nil {
		return Target{}, err
	}
	return Target{ID: req.ID, DisplayName: req.DisplayName, Region: req.Region, Tags: req.Tags, Status: defaultStatus(req.Status), UpdatedAt: now}, nil
}

func (s *Store) CreateCheck(ctx context.Context, req CreateCheckRequest) (Check, error) {
	now := time.Now().UTC().Truncate(time.Second).Format(time.RFC3339)
	if err := insertCheck(ctx, s.db, req, now); err != nil {
		return Check{}, err
	}
	return Check{ID: req.ID, DisplayName: req.DisplayName, SourceID: req.SourceID, TargetID: req.TargetID, Tags: req.Tags, Status: defaultCheckStatus(req.Status), LatencyMS: req.LatencyMS, LossPct: req.LossPct, JitterMS: req.JitterMS, UpdatedAt: now}, nil
}

func (s *Store) CreateAgent(ctx context.Context, req CreateAgentRequest) (CreateAgentResponse, error) {
	if req.ID == "" {
		return CreateAgentResponse{}, errors.New("id is required")
	}
	var exists int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM sources WHERE id = ?`, req.ID).Scan(&exists); err != nil {
		return CreateAgentResponse{}, err
	}
	if exists == 0 {
		return CreateAgentResponse{}, errors.New("source not found")
	}
	token, err := newAgentToken()
	if err != nil {
		return CreateAgentResponse{}, err
	}
	now := time.Now().UTC().Truncate(time.Second).Format(time.RFC3339)
	agent := Agent{ID: req.ID, SourceID: req.ID, TokenPrefix: tokenPrefix(token), CreatedAt: now}
	_, err = s.db.ExecContext(ctx, `INSERT INTO agents (id, token_hash, token_prefix, created_at) VALUES (?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET token_hash = excluded.token_hash, token_prefix = excluded.token_prefix, created_at = excluded.created_at, last_seen_at = '', last_reported_at = '', version = '', hostname = ''`,
		req.ID, hashToken(token), agent.TokenPrefix, now)
	if err != nil {
		return CreateAgentResponse{}, err
	}
	return CreateAgentResponse{Agent: agent, Token: token}, nil
}

func (s *Store) ListAgents(ctx context.Context) ([]Agent, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, id, token_prefix, created_at, last_seen_at, last_reported_at, version, hostname FROM agents ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var agents []Agent
	for rows.Next() {
		var agent Agent
		if err := rows.Scan(&agent.ID, &agent.SourceID, &agent.TokenPrefix, &agent.CreatedAt, &agent.LastSeenAt, &agent.LastReportedAt, &agent.Version, &agent.Hostname); err != nil {
			return nil, err
		}
		agents = append(agents, agent)
	}
	return agents, rows.Err()
}

func (s *Store) AgentIDForToken(ctx context.Context, token string) (string, error) {
	var id string
	err := s.db.QueryRowContext(ctx, `SELECT id FROM agents WHERE token_hash = ?`, hashToken(token)).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return "", errors.New("invalid agent token")
	}
	return id, err
}

func (s *Store) AgentChecks(ctx context.Context, agentID, version, hostname string) ([]AgentCheck, error) {
	now := time.Now().UTC().Truncate(time.Second).Format(time.RFC3339)
	_, err := s.db.ExecContext(ctx, `UPDATE agents SET last_seen_at = ?, version = ?, hostname = ? WHERE id = ?`, now, version, hostname, agentID)
	if err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `SELECT c.id, c.display_name, t.endpoint, c.interval_seconds FROM checks c JOIN targets t ON t.id = c.target_id WHERE c.source_id = ? ORDER BY c.id`, agentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var checks []AgentCheck
	for rows.Next() {
		var endpoint string
		var check AgentCheck
		if err := rows.Scan(&check.CheckID, &check.DisplayName, &endpoint, &check.IntervalSeconds); err != nil {
			return nil, err
		}
		host, port, err := splitEndpoint(endpoint)
		if err != nil {
			return nil, err
		}
		check.Host = host
		check.Port = port
		checks = append(checks, check)
	}
	return checks, rows.Err()
}

func (s *Store) RecordAgentResults(ctx context.Context, agentID string, results []AgentResult) (int, error) {
	if len(results) == 0 {
		return 0, nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	accepted := 0
	for _, result := range results {
		if result.CheckID == "" {
			continue
		}
		var owner string
		if err := tx.QueryRowContext(ctx, `SELECT source_id FROM checks WHERE id = ?`, result.CheckID).Scan(&owner); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				continue
			}
			return accepted, err
		}
		if owner != agentID {
			continue
		}
		when := result.ObservedAt
		if when == "" {
			when = time.Now().UTC().Truncate(time.Second).Format(time.RFC3339)
		}
		status := defaultCheckStatus(result.Status)
		_, err := tx.ExecContext(ctx, `INSERT INTO series_points (check_id, latency_ms, loss_pct, jitter_ms, updated_at) VALUES (?, ?, ?, ?, ?)`, result.CheckID, result.TCPConnectMS, result.Loss, result.JitterMS, when)
		if err != nil {
			return accepted, err
		}
		_, err = tx.ExecContext(ctx, `UPDATE checks SET latency_ms = ?, loss_pct = ?, jitter_ms = ?, status = ?, updated_at = ? WHERE id = ?`, result.TCPConnectMS, result.Loss, result.JitterMS, status, when, result.CheckID)
		if err != nil {
			return accepted, err
		}
		accepted++
	}
	if accepted > 0 {
		now := time.Now().UTC().Truncate(time.Second).Format(time.RFC3339)
		_, err = tx.ExecContext(ctx, `UPDATE agents SET last_reported_at = ?, last_seen_at = ? WHERE id = ?`, now, now, agentID)
		if err != nil {
			return accepted, err
		}
		_, err = tx.ExecContext(ctx, `UPDATE sources SET status = 'online', updated_at = ? WHERE id = ?`, now, agentID)
		if err != nil {
			return accepted, err
		}
	}
	if err := tx.Commit(); err != nil {
		return accepted, err
	}
	return accepted, nil
}

type sqlExecer interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

func insertSource(ctx context.Context, execer sqlExecer, req CreateSourceRequest, updatedAt string) error {
	if req.ID == "" || req.DisplayName == "" {
		return errors.New("id and display_name are required")
	}
	_, err := execer.ExecContext(ctx, `INSERT INTO sources (id, display_name, region, tags, status, endpoint, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, req.ID, req.DisplayName, req.Region, encodeTags(req.Tags), defaultStatus(req.Status), req.Endpoint, updatedAt)
	return err
}

func insertTarget(ctx context.Context, execer sqlExecer, req CreateTargetRequest, updatedAt string) error {
	if req.ID == "" || req.DisplayName == "" {
		return errors.New("id and display_name are required")
	}
	_, err := execer.ExecContext(ctx, `INSERT INTO targets (id, display_name, region, tags, status, endpoint, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, req.ID, req.DisplayName, req.Region, encodeTags(req.Tags), defaultStatus(req.Status), req.Endpoint, updatedAt)
	return err
}

func insertCheck(ctx context.Context, execer sqlExecer, req CreateCheckRequest, updatedAt string) error {
	if req.ID == "" || req.DisplayName == "" || req.SourceID == "" || req.TargetID == "" {
		return errors.New("id, display_name, source_id, and target_id are required")
	}
	interval := req.IntervalSeconds
	if interval <= 0 {
		interval = 30
	}
	_, err := execer.ExecContext(ctx, `INSERT INTO checks (id, display_name, source_id, target_id, tags, status, latency_ms, loss_pct, jitter_ms, interval_seconds, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, req.ID, req.DisplayName, req.SourceID, req.TargetID, encodeTags(req.Tags), defaultCheckStatus(req.Status), req.LatencyMS, req.LossPct, req.JitterMS, interval, updatedAt)
	return err
}

func defaultStatus(status string) string {
	if status == "" {
		return "online"
	}
	return status
}

func newAgentToken() (string, error) {
	random := make([]byte, 32)
	if _, err := rand.Read(random); err != nil {
		return "", err
	}
	return "wpa_" + hex.EncodeToString(random), nil
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func tokenPrefix(token string) string {
	if len(token) <= 12 {
		return token
	}
	return token[:12]
}

func splitEndpoint(endpoint string) (string, int, error) {
	host, portText, err := net.SplitHostPort(endpoint)
	if err != nil {
		return "", 0, fmt.Errorf("invalid target endpoint %q", endpoint)
	}
	port, err := strconv.Atoi(portText)
	if err != nil || port <= 0 || port > 65535 {
		return "", 0, fmt.Errorf("invalid target endpoint %q", endpoint)
	}
	return host, port, nil
}

func defaultCheckStatus(status string) string {
	if status == "" {
		return "ok"
	}
	return status
}
