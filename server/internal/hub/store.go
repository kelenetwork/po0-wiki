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
	"regexp"
	"strconv"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

type Store struct {
	db *sql.DB
}

var errRelatedChecks = errors.New("请先删除关联任务")

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
	Kind        string   `json:"kind"`
	UpdatedAt   string   `json:"updated_at"`
}

type AdminTarget struct {
	ID          string   `json:"id"`
	DisplayName string   `json:"display_name"`
	Region      string   `json:"region"`
	Tags        []string `json:"tags"`
	Status      string   `json:"status"`
	Kind        string   `json:"kind"`
	Host        string   `json:"host"`
	Port        int      `json:"port"`
	Path        string   `json:"path"`
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

type AdminCheck struct {
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
	Enabled         bool     `json:"enabled"`
	LastError       string   `json:"last_error"`
	UpdatedAt       string   `json:"updated_at"`
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
	Name        string   `json:"name"`
	DisplayName string   `json:"display_name"`
	Region      string   `json:"region"`
	Tags        []string `json:"tags"`
	Status      string   `json:"status"`
	Endpoint    string   `json:"endpoint"`
}

type CreateTargetRequest struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	DisplayName string   `json:"display_name"`
	Region      string   `json:"region"`
	Tags        []string `json:"tags"`
	Status      string   `json:"status"`
	Endpoint    string   `json:"endpoint"`
	Kind        string   `json:"kind"`
	Host        string   `json:"host"`
	Port        int      `json:"port"`
	Path        string   `json:"path"`
}

type CreateCheckRequest struct {
	ID              string   `json:"id"`
	Name            string   `json:"name"`
	DisplayName     string   `json:"display_name"`
	SourceID        string   `json:"source_id"`
	TargetID        string   `json:"target_id"`
	Tags            []string `json:"tags"`
	Status          string   `json:"status"`
	LatencyMS       float64  `json:"latency_ms"`
	LossPct         float64  `json:"loss_pct"`
	JitterMS        float64  `json:"jitter_ms"`
	IntervalSeconds int      `json:"interval_seconds"`
	Enabled         *bool    `json:"enabled"`
}

type UpdateSourceRequest struct {
	DisplayName string   `json:"display_name"`
	Region      string   `json:"region"`
	Tags        []string `json:"tags"`
}

type AgentInstallResponse struct {
	AgentID          string `json:"agent_id"`
	Token            string `json:"token"`
	HubURL           string `json:"hub_url"`
	SystemdUnit      string `json:"systemd_unit"`
	ConfigJSON       string `json:"config_json"`
	InstallCommand   string `json:"install_command"`
	OneLine          string `json:"one_line"`
	OneLineUninstall string `json:"one_line_uninstall"`
}

type Agent struct {
	ID             string `json:"id"`
	SourceID       string `json:"source_id"`
	Token          string `json:"token"`
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
	Kind            string `json:"kind"`
	Path            string `json:"path"`
	IntervalSeconds int    `json:"interval_seconds"`
}

type AgentResult struct {
	CheckID      string  `json:"check_id"`
	Kind         string  `json:"kind,omitempty"`
	TCPConnectMS float64 `json:"tcp_connect_ms"`
	Loss         float64 `json:"loss"`
	JitterMS     float64 `json:"jitter_ms"`
	Status       string  `json:"status"`
	ObservedAt   string  `json:"observed_at"`
	Code         int     `json:"code,omitempty"`
	Error        string  `json:"error,omitempty"`
}

type LGJob struct {
	ID          string `json:"id"`
	AgentID     string `json:"agent_id"`
	Tool        string `json:"tool"`
	TargetID    string `json:"target_id"`
	TargetHost  string `json:"target_host"`
	TargetPort  int    `json:"target_port"`
	Status      string `json:"status"`
	Output      string `json:"output,omitempty"`
	Error       string `json:"error,omitempty"`
	CreatedAt   string `json:"created_at"`
	StartedAt   string `json:"started_at,omitempty"`
	CompletedAt string `json:"completed_at,omitempty"`
}

type LGJobResult struct {
	Status      string `json:"status"`
	Output      string `json:"output,omitempty"`
	Error       string `json:"error,omitempty"`
	StartedAt   string `json:"started_at,omitempty"`
	CompletedAt string `json:"completed_at,omitempty"`
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
  kind TEXT NOT NULL DEFAULT 'tcp',
  path TEXT NOT NULL DEFAULT '',
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
  enabled INTEGER NOT NULL DEFAULT 1,
  last_error TEXT NOT NULL DEFAULT '',
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
  hostname TEXT NOT NULL DEFAULT '',
  pending_token TEXT NOT NULL DEFAULT '',
  token_plain TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS lg_jobs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  target_id TEXT NOT NULL,
  target_host TEXT NOT NULL,
  target_port INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  output TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT '',
  completed_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_lg_jobs_agent_pending ON lg_jobs(agent_id, status) WHERE status='pending';
`)
	if err != nil {
		return err
	}
	_, _ = s.db.ExecContext(ctx, `ALTER TABLE checks ADD COLUMN interval_seconds INTEGER NOT NULL DEFAULT 30`)
	_, _ = s.db.ExecContext(ctx, `ALTER TABLE checks ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1`)
	_, _ = s.db.ExecContext(ctx, `ALTER TABLE checks ADD COLUMN last_error TEXT NOT NULL DEFAULT ''`)
	_, _ = s.db.ExecContext(ctx, `ALTER TABLE targets ADD COLUMN kind TEXT NOT NULL DEFAULT 'tcp'`)
	_, _ = s.db.ExecContext(ctx, `ALTER TABLE targets ADD COLUMN path TEXT NOT NULL DEFAULT ''`)
	_, err = s.db.ExecContext(ctx, `UPDATE targets SET kind = 'https' WHERE kind = 'http' AND endpoint LIKE '%:443'`)
	if err != nil {
		return err
	}
	_, _ = s.db.ExecContext(ctx, `ALTER TABLE agents ADD COLUMN pending_token TEXT NOT NULL DEFAULT ''`)
	_, _ = s.db.ExecContext(ctx, `ALTER TABLE agents ADD COLUMN token_plain TEXT NOT NULL DEFAULT ''`)
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
	rows, err := s.db.QueryContext(ctx, `SELECT s.id, s.display_name, s.region, s.tags, s.status, s.updated_at, COALESCE(MAX(a.last_reported_at, a.last_seen_at), '') FROM sources s LEFT JOIN agents a ON a.id = s.id ORDER BY s.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var sources []Source
	now := time.Now().UTC()
	for rows.Next() {
		var source Source
		var tags string
		var lastReportedAt string
		if err := rows.Scan(&source.ID, &source.DisplayName, &source.Region, &tags, &source.Status, &source.UpdatedAt, &lastReportedAt); err != nil {
			return nil, err
		}
		source.Tags = decodeTags(tags)
		source.Status = derivedSourceStatus(lastReportedAt, now)
		if strings.TrimSpace(lastReportedAt) != "" {
			source.UpdatedAt = lastReportedAt
		}
		sources = append(sources, source)
	}
	return sources, rows.Err()
}

func (s *Store) ListTargets(ctx context.Context) ([]Target, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, display_name, region, tags, status, kind, updated_at FROM targets ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var targets []Target
	for rows.Next() {
		var target Target
		var tags string
		if err := rows.Scan(&target.ID, &target.DisplayName, &target.Region, &tags, &target.Status, &target.Kind, &target.UpdatedAt); err != nil {
			return nil, err
		}
		target.Tags = decodeTags(tags)
		target.Kind = normalizeTargetKind(target.Kind)
		targets = append(targets, target)
	}
	return targets, rows.Err()
}

func (s *Store) ListAdminTargets(ctx context.Context) ([]AdminTarget, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, display_name, region, tags, status, endpoint, kind, path, updated_at FROM targets ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var targets []AdminTarget
	for rows.Next() {
		var target AdminTarget
		var tags string
		var endpoint string
		if err := rows.Scan(&target.ID, &target.DisplayName, &target.Region, &tags, &target.Status, &endpoint, &target.Kind, &target.Path, &target.UpdatedAt); err != nil {
			return nil, err
		}
		target.Tags = decodeTags(tags)
		target.Kind = normalizeTargetKind(target.Kind)
		target.Path = normalizeTargetPath(target.Kind, target.Path)
		target.Host, target.Port, _ = splitEndpointForKind(endpoint, target.Kind)
		targets = append(targets, target)
	}
	return targets, rows.Err()
}

func (s *Store) LookingGlassEndpoint(ctx context.Context, sourceID string, targetID string) (Source, AdminTarget, error) {
	if strings.TrimSpace(sourceID) == "" || strings.TrimSpace(targetID) == "" {
		return Source{}, AdminTarget{}, errors.New("source_id and target_id are required")
	}
	var source Source
	var sourceTags string
	var lastReportedAt string
	if err := s.db.QueryRowContext(ctx, `SELECT s.id, s.display_name, s.region, s.tags, s.status, s.updated_at, COALESCE(MAX(a.last_reported_at, a.last_seen_at), '') FROM sources s LEFT JOIN agents a ON a.id = s.id WHERE s.id = ?`, sourceID).Scan(&source.ID, &source.DisplayName, &source.Region, &sourceTags, &source.Status, &source.UpdatedAt, &lastReportedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Source{}, AdminTarget{}, errors.New("source not found")
		}
		return Source{}, AdminTarget{}, err
	}
	source.Tags = decodeTags(sourceTags)
	source.Status = derivedSourceStatus(lastReportedAt, time.Now().UTC())
	if strings.TrimSpace(lastReportedAt) != "" {
		source.UpdatedAt = lastReportedAt
	}

	var target AdminTarget
	var targetTags string
	var endpoint string
	if err := s.db.QueryRowContext(ctx, `SELECT id, display_name, region, tags, status, endpoint, kind, path, updated_at FROM targets WHERE id = ?`, targetID).Scan(&target.ID, &target.DisplayName, &target.Region, &targetTags, &target.Status, &endpoint, &target.Kind, &target.Path, &target.UpdatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Source{}, AdminTarget{}, errors.New("target not found")
		}
		return Source{}, AdminTarget{}, err
	}
	target.Tags = decodeTags(targetTags)
	target.Kind = normalizeTargetKind(target.Kind)
	target.Path = normalizeTargetPath(target.Kind, target.Path)
	target.Host, target.Port, _ = splitEndpoint(endpoint)
	if target.Host == "" {
		return Source{}, AdminTarget{}, errors.New("target endpoint is empty")
	}
	return source, target, nil
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

func (s *Store) ListAdminChecks(ctx context.Context) ([]AdminCheck, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, display_name, source_id, target_id, tags, status, latency_ms, loss_pct, jitter_ms, interval_seconds, enabled, last_error, updated_at FROM checks ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var checks []AdminCheck
	for rows.Next() {
		var check AdminCheck
		var tags string
		var enabled int
		if err := rows.Scan(&check.ID, &check.DisplayName, &check.SourceID, &check.TargetID, &tags, &check.Status, &check.LatencyMS, &check.LossPct, &check.JitterMS, &check.IntervalSeconds, &enabled, &check.LastError, &check.UpdatedAt); err != nil {
			return nil, err
		}
		check.Tags = decodeTags(tags)
		check.Enabled = enabled != 0
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
	prepared, err := s.prepareCreateID(ctx, "sources", "src", req.ID, req.Name, req.DisplayName)
	if err != nil {
		return Source{}, err
	}
	req.ID = prepared.ID
	req.DisplayName = prepared.DisplayName
	now := time.Now().UTC().Truncate(time.Second).Format(time.RFC3339)
	if err := insertSource(ctx, s.db, req, now); err != nil {
		return Source{}, err
	}
	return Source{ID: req.ID, DisplayName: req.DisplayName, Region: req.Region, Tags: req.Tags, Status: defaultStatus(req.Status), UpdatedAt: now}, nil
}

func (s *Store) CreateTarget(ctx context.Context, req CreateTargetRequest) (Target, error) {
	prepared, err := s.prepareCreateID(ctx, "targets", "tgt", req.ID, req.Name, req.DisplayName)
	if err != nil {
		return Target{}, err
	}
	req.ID = prepared.ID
	req.DisplayName = prepared.DisplayName
	now := time.Now().UTC().Truncate(time.Second).Format(time.RFC3339)
	if err := insertTarget(ctx, s.db, req, now); err != nil {
		return Target{}, err
	}
	return Target{ID: req.ID, DisplayName: req.DisplayName, Region: req.Region, Tags: req.Tags, Status: defaultStatus(req.Status), Kind: normalizeTargetKind(req.Kind), UpdatedAt: now}, nil
}

func (s *Store) UpdateSource(ctx context.Context, id string, req UpdateSourceRequest) (Source, error) {
	if id == "" || req.DisplayName == "" {
		return Source{}, errors.New("id and display_name are required")
	}
	now := time.Now().UTC().Truncate(time.Second).Format(time.RFC3339)
	result, err := s.db.ExecContext(ctx, `UPDATE sources SET display_name = ?, region = ?, tags = ?, updated_at = ? WHERE id = ?`, req.DisplayName, req.Region, encodeTags(req.Tags), now, id)
	if err != nil {
		return Source{}, err
	}
	if rows, _ := result.RowsAffected(); rows == 0 {
		return Source{}, errors.New("source not found")
	}
	var source Source
	var tags string
	if err := s.db.QueryRowContext(ctx, `SELECT id, display_name, region, tags, status, updated_at FROM sources WHERE id = ?`, id).Scan(&source.ID, &source.DisplayName, &source.Region, &tags, &source.Status, &source.UpdatedAt); err != nil {
		return Source{}, err
	}
	source.Tags = decodeTags(tags)
	return source, nil
}

func (s *Store) UpdateTarget(ctx context.Context, id string, req CreateTargetRequest) (AdminTarget, error) {
	if id == "" || req.DisplayName == "" {
		return AdminTarget{}, errors.New("id and display_name are required")
	}
	prepared, err := prepareTarget(req)
	if err != nil {
		return AdminTarget{}, err
	}
	now := time.Now().UTC().Truncate(time.Second).Format(time.RFC3339)
	result, err := s.db.ExecContext(ctx, `UPDATE targets SET display_name = ?, region = ?, tags = ?, status = ?, endpoint = ?, kind = ?, path = ?, updated_at = ? WHERE id = ?`, req.DisplayName, req.Region, encodeTags(req.Tags), defaultStatus(req.Status), prepared.Endpoint, prepared.Kind, prepared.Path, now, id)
	if err != nil {
		return AdminTarget{}, err
	}
	if rows, _ := result.RowsAffected(); rows == 0 {
		return AdminTarget{}, errors.New("target not found")
	}
	return AdminTarget{ID: id, DisplayName: req.DisplayName, Region: req.Region, Tags: req.Tags, Status: defaultStatus(req.Status), Kind: prepared.Kind, Host: prepared.Host, Port: prepared.Port, Path: prepared.Path, UpdatedAt: now}, nil
}

func (s *Store) CreateCheck(ctx context.Context, req CreateCheckRequest) (Check, error) {
	prepared, err := s.prepareCreateID(ctx, "checks", "chk", req.ID, req.Name, req.DisplayName)
	if err != nil {
		return Check{}, err
	}
	req.ID = prepared.ID
	req.DisplayName = prepared.DisplayName
	now := time.Now().UTC().Truncate(time.Second).Format(time.RFC3339)
	if err := insertCheck(ctx, s.db, req, now); err != nil {
		return Check{}, err
	}
	return Check{ID: req.ID, DisplayName: req.DisplayName, SourceID: req.SourceID, TargetID: req.TargetID, Tags: req.Tags, Status: defaultCheckStatus(req.Status), LatencyMS: req.LatencyMS, LossPct: req.LossPct, JitterMS: req.JitterMS, UpdatedAt: now}, nil
}

func (s *Store) UpdateCheck(ctx context.Context, id string, req CreateCheckRequest) (AdminCheck, error) {
	if id == "" || req.DisplayName == "" || req.SourceID == "" || req.TargetID == "" {
		return AdminCheck{}, errors.New("id, display_name, source_id, and target_id are required")
	}
	interval := req.IntervalSeconds
	if interval <= 0 {
		interval = 30
	}
	enabled := boolToInt(true)
	if req.Enabled != nil {
		enabled = boolToInt(*req.Enabled)
	}
	now := time.Now().UTC().Truncate(time.Second).Format(time.RFC3339)
	result, err := s.db.ExecContext(ctx, `UPDATE checks SET display_name = ?, source_id = ?, target_id = ?, tags = ?, status = ?, interval_seconds = ?, enabled = ?, updated_at = ? WHERE id = ?`, req.DisplayName, req.SourceID, req.TargetID, encodeTags(req.Tags), defaultCheckStatus(req.Status), interval, enabled, now, id)
	if err != nil {
		return AdminCheck{}, err
	}
	if rows, _ := result.RowsAffected(); rows == 0 {
		return AdminCheck{}, errors.New("check not found")
	}
	return AdminCheck{ID: id, DisplayName: req.DisplayName, SourceID: req.SourceID, TargetID: req.TargetID, Tags: req.Tags, Status: defaultCheckStatus(req.Status), LatencyMS: req.LatencyMS, LossPct: req.LossPct, JitterMS: req.JitterMS, IntervalSeconds: interval, Enabled: enabled != 0, UpdatedAt: now}, nil
}

type preparedCreateID struct {
	ID          string
	DisplayName string
}

var legalIDPattern = regexp.MustCompile(`^[a-z0-9-]+$`)

func (s *Store) prepareCreateID(ctx context.Context, table string, prefix string, id string, name string, displayName string) (preparedCreateID, error) {
	display := strings.TrimSpace(displayName)
	if display == "" {
		display = strings.TrimSpace(name)
	}
	if display == "" {
		display = "未命名"
	}
	if id != "" {
		if !legalIDPattern.MatchString(id) {
			return preparedCreateID{}, errors.New("id must contain only lowercase letters, numbers, and hyphens")
		}
		return preparedCreateID{ID: id, DisplayName: display}, nil
	}
	generated, err := s.nextSlugID(ctx, table, prefix, display)
	if err != nil {
		return preparedCreateID{}, err
	}
	return preparedCreateID{ID: generated, DisplayName: display}, nil
}

func (s *Store) nextSlugID(ctx context.Context, table string, prefix string, name string) (string, error) {
	base := slugify(prefix, name)
	for index := 1; ; index++ {
		candidate := base
		if index > 1 {
			candidate = fmt.Sprintf("%s-%d", base, index)
		}
		var exists int
		query := fmt.Sprintf("SELECT COUNT(*) FROM %s WHERE id = ?", table)
		if err := s.db.QueryRowContext(ctx, query, candidate).Scan(&exists); err != nil {
			return "", err
		}
		if exists == 0 {
			return candidate, nil
		}
	}
}

func slugify(prefix string, name string) string {
	value := strings.ToLower(strings.TrimSpace(name))
	var builder strings.Builder
	previousHyphen := false
	for _, r := range value {
		allowed := (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9')
		if allowed {
			builder.WriteRune(r)
			previousHyphen = false
			continue
		}
		if r == '-' || r == '_' || r == ' ' || r == '\t' || r == '\n' || r == '\r' {
			if builder.Len() > 0 && !previousHyphen {
				builder.WriteByte('-')
				previousHyphen = true
			}
		}
	}
	slug := strings.Trim(builder.String(), "-")
	if slug == "" {
		slug = "item"
	}
	return prefix + "-" + slug
}

func (s *Store) DeleteSource(ctx context.Context, id string) error {
	if id == "" {
		return errors.New("id is required")
	}
	var related int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM checks WHERE source_id = ?`, id).Scan(&related); err != nil {
		return err
	}
	if related > 0 {
		return errRelatedChecks
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM agents WHERE id = ?`, id); err != nil {
		return err
	}
	result, err := tx.ExecContext(ctx, `DELETE FROM sources WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if rows, _ := result.RowsAffected(); rows == 0 {
		return errors.New("source not found")
	}
	return tx.Commit()
}

func (s *Store) DeleteTarget(ctx context.Context, id string) error {
	if id == "" {
		return errors.New("id is required")
	}
	var related int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM checks WHERE target_id = ?`, id).Scan(&related); err != nil {
		return err
	}
	if related > 0 {
		return errRelatedChecks
	}
	result, err := s.db.ExecContext(ctx, `DELETE FROM targets WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if rows, _ := result.RowsAffected(); rows == 0 {
		return errors.New("target not found")
	}
	return nil
}

func (s *Store) DeleteCheck(ctx context.Context, id string) error {
	if id == "" {
		return errors.New("id is required")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM series_points WHERE check_id = ?`, id); err != nil {
		return err
	}
	result, err := tx.ExecContext(ctx, `DELETE FROM checks WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if rows, _ := result.RowsAffected(); rows == 0 {
		return errors.New("check not found")
	}
	return tx.Commit()
}

func (s *Store) DeleteAgent(ctx context.Context, id string) error {
	if id == "" {
		return errors.New("id is required")
	}
	result, err := s.db.ExecContext(ctx, `DELETE FROM agents WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if rows, _ := result.RowsAffected(); rows == 0 {
		return errors.New("agent not found")
	}
	return nil
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
	agent := Agent{ID: req.ID, SourceID: req.ID, Token: token, TokenPrefix: tokenPrefix(token), CreatedAt: now}
	_, err = s.db.ExecContext(ctx, `INSERT INTO agents (id, token_hash, token_prefix, token_plain, created_at, pending_token) VALUES (?, ?, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET token_hash = excluded.token_hash, token_prefix = excluded.token_prefix, token_plain = excluded.token_plain, created_at = excluded.created_at, last_seen_at = '', last_reported_at = '', version = '', hostname = '', pending_token = excluded.pending_token`,
		req.ID, hashToken(token), agent.TokenPrefix, token, now, token)
	if err != nil {
		return CreateAgentResponse{}, err
	}
	return CreateAgentResponse{Agent: agent, Token: token}, nil
}

func (s *Store) ResetAgentToken(ctx context.Context, id string) (CreateAgentResponse, error) {
	if id == "" {
		return CreateAgentResponse{}, errors.New("id is required")
	}
	token, err := newAgentToken()
	if err != nil {
		return CreateAgentResponse{}, err
	}
	now := time.Now().UTC().Truncate(time.Second).Format(time.RFC3339)
	result, err := s.db.ExecContext(ctx, `UPDATE agents SET token_hash = ?, token_prefix = ?, token_plain = ?, created_at = ?, pending_token = ?, last_seen_at = '', last_reported_at = '', version = '', hostname = '' WHERE id = ?`, hashToken(token), tokenPrefix(token), token, now, token, id)
	if err != nil {
		return CreateAgentResponse{}, err
	}
	if rows, _ := result.RowsAffected(); rows == 0 {
		return CreateAgentResponse{}, errors.New("agent not found")
	}
	agent := Agent{ID: id, SourceID: id, Token: token, TokenPrefix: tokenPrefix(token), CreatedAt: now}
	return CreateAgentResponse{Agent: agent, Token: token}, nil
}

func (s *Store) AgentInstall(ctx context.Context, id, hubURL, releaseBaseURL string) (AgentInstallResponse, error) {
	var token string
	if err := s.db.QueryRowContext(ctx, `SELECT token_plain FROM agents WHERE id = ?`, id).Scan(&token); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return AgentInstallResponse{}, errors.New("agent not found")
		}
		return AgentInstallResponse{}, err
	}
	if token == "" {
		return AgentInstallResponse{}, errors.New("请先重置 Token 以生成接入凭据")
	}
	config := agentConfigJSON(id, token, hubURL)
	return AgentInstallResponse{AgentID: id, Token: token, HubURL: hubURL, SystemdUnit: agentSystemdUnit(), ConfigJSON: config, InstallCommand: agentInstallCommand(), OneLine: agentOneLineInstall(id, token, hubURL, releaseBaseURL), OneLineUninstall: agentOneLineUninstall(releaseBaseURL)}, nil
}

func (s *Store) ListAgents(ctx context.Context) ([]Agent, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, id, token_plain, token_prefix, created_at, last_seen_at, last_reported_at, version, hostname FROM agents ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var agents []Agent
	for rows.Next() {
		var agent Agent
		if err := rows.Scan(&agent.ID, &agent.SourceID, &agent.Token, &agent.TokenPrefix, &agent.CreatedAt, &agent.LastSeenAt, &agent.LastReportedAt, &agent.Version, &agent.Hostname); err != nil {
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
	rows, err := s.db.QueryContext(ctx, `SELECT c.id, c.display_name, t.endpoint, t.kind, t.path, c.interval_seconds FROM checks c JOIN targets t ON t.id = c.target_id WHERE c.source_id = ? AND c.enabled = 1 ORDER BY c.id`, agentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var checks []AgentCheck
	for rows.Next() {
		var endpoint string
		var check AgentCheck
		if err := rows.Scan(&check.CheckID, &check.DisplayName, &endpoint, &check.Kind, &check.Path, &check.IntervalSeconds); err != nil {
			return nil, err
		}
		check.Kind = normalizeTargetKind(check.Kind)
		check.Path = normalizeTargetPath(check.Kind, check.Path)
		host, port, err := splitEndpointForKind(endpoint, check.Kind)
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
		lastError := result.Error
		if status == "ok" {
			lastError = ""
		}
		_, err = tx.ExecContext(ctx, `UPDATE checks SET latency_ms = ?, loss_pct = ?, jitter_ms = ?, status = ?, last_error = ?, updated_at = ? WHERE id = ?`, result.TCPConnectMS, result.Loss, result.JitterMS, status, lastError, when, result.CheckID)
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
	}
	if err := tx.Commit(); err != nil {
		return accepted, err
	}
	return accepted, nil
}

func (s *Store) CreateLGJob(ctx context.Context, agentID, tool, targetID, targetHost string, targetPort int) (LGJob, error) {
	if strings.TrimSpace(agentID) == "" || strings.TrimSpace(tool) == "" || strings.TrimSpace(targetID) == "" || strings.TrimSpace(targetHost) == "" {
		return LGJob{}, errors.New("agent_id, tool, target_id, and target_host are required")
	}
	id, err := newLGJobID()
	if err != nil {
		return LGJob{}, err
	}
	now := time.Now().UTC().Truncate(time.Second).Format(time.RFC3339)
	job := LGJob{ID: id, AgentID: agentID, Tool: tool, TargetID: targetID, TargetHost: targetHost, TargetPort: targetPort, Status: "pending", CreatedAt: now}
	_, err = s.db.ExecContext(ctx, `INSERT INTO lg_jobs (id, agent_id, tool, target_id, target_host, target_port, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, job.ID, job.AgentID, job.Tool, job.TargetID, job.TargetHost, job.TargetPort, job.Status, job.CreatedAt)
	return job, err
}

func (s *Store) LGJobResult(ctx context.Context, id string) (LGJobResult, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return LGJobResult{}, errors.New("job_id is required")
	}
	var result LGJobResult
	var host, displayName string
	err := s.db.QueryRowContext(ctx, `SELECT j.status, j.output, j.error, j.started_at, j.completed_at, j.target_host, COALESCE(t.display_name, j.target_id) FROM lg_jobs j LEFT JOIN targets t ON t.id = j.target_id WHERE j.id = ?`, id).Scan(&result.Status, &result.Output, &result.Error, &result.StartedAt, &result.CompletedAt, &host, &displayName)
	if errors.Is(err, sql.ErrNoRows) {
		return LGJobResult{}, errors.New("job not found")
	}
	if err != nil {
		return LGJobResult{}, err
	}
	result.Output = sanitizeLGOutput(result.Output, host, displayName)
	result.Error = sanitizeLGOutput(result.Error, host, displayName)
	return result, nil
}

func (s *Store) ClaimLGJob(ctx context.Context, agentID string) (LGJob, bool, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return LGJob{}, false, err
	}
	defer tx.Rollback()
	var job LGJob
	err = tx.QueryRowContext(ctx, `SELECT id, agent_id, tool, target_id, target_host, target_port, status, output, error, created_at, started_at, completed_at FROM lg_jobs WHERE agent_id = ? AND status = 'pending' ORDER BY created_at, id LIMIT 1`, agentID).Scan(&job.ID, &job.AgentID, &job.Tool, &job.TargetID, &job.TargetHost, &job.TargetPort, &job.Status, &job.Output, &job.Error, &job.CreatedAt, &job.StartedAt, &job.CompletedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return LGJob{}, false, nil
	}
	if err != nil {
		return LGJob{}, false, err
	}
	now := time.Now().UTC().Truncate(time.Second).Format(time.RFC3339)
	res, err := tx.ExecContext(ctx, `UPDATE lg_jobs SET status = 'running', started_at = ? WHERE id = ? AND status = 'pending'`, now, job.ID)
	if err != nil {
		return LGJob{}, false, err
	}
	changed, _ := res.RowsAffected()
	if changed == 0 {
		return LGJob{}, false, nil
	}
	if err := tx.Commit(); err != nil {
		return LGJob{}, false, err
	}
	job.Status = "running"
	job.StartedAt = now
	return job, true, nil
}

func (s *Store) CompleteLGJob(ctx context.Context, agentID, jobID, outputText, errorText string) error {
	jobID = strings.TrimSpace(jobID)
	if jobID == "" {
		return errors.New("job_id is required")
	}
	status := "completed"
	if strings.TrimSpace(errorText) != "" {
		status = "failed"
	}
	now := time.Now().UTC().Truncate(time.Second).Format(time.RFC3339)
	res, err := s.db.ExecContext(ctx, `UPDATE lg_jobs SET status = ?, output = ?, error = ?, completed_at = ? WHERE id = ? AND agent_id = ? AND status IN ('pending', 'running')`, status, outputText, errorText, now, jobID, agentID)
	if err != nil {
		return err
	}
	changed, _ := res.RowsAffected()
	if changed == 0 {
		return errors.New("job not found")
	}
	return nil
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
	prepared, err := prepareTarget(req)
	if err != nil {
		return err
	}
	_, err = execer.ExecContext(ctx, `INSERT INTO targets (id, display_name, region, tags, status, endpoint, kind, path, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, req.ID, req.DisplayName, req.Region, encodeTags(req.Tags), defaultStatus(req.Status), prepared.Endpoint, prepared.Kind, prepared.Path, updatedAt)
	return err
}
func insertCheck(ctx context.Context, execer sqlExecer, req CreateCheckRequest, updatedAt string) error {
	if req.ID == "" || req.DisplayName == "" {
		return errors.New("id and display_name are required")
	}
	interval := req.IntervalSeconds
	if interval <= 0 {
		interval = 30
	}
	enabled := boolToInt(true)
	if req.Enabled != nil {
		enabled = boolToInt(*req.Enabled)
	}
	_, err := execer.ExecContext(ctx, `INSERT INTO checks (id, display_name, source_id, target_id, tags, status, latency_ms, loss_pct, jitter_ms, interval_seconds, enabled, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, req.ID, req.DisplayName, req.SourceID, req.TargetID, encodeTags(req.Tags), defaultCheckStatus(req.Status), req.LatencyMS, req.LossPct, req.JitterMS, interval, enabled, updatedAt)
	return err
}

type preparedTarget struct {
	Endpoint string
	Kind     string
	Host     string
	Port     int
	Path     string
}

func prepareTarget(req CreateTargetRequest) (preparedTarget, error) {
	kind := normalizeTargetKind(req.Kind)
	if kind == "" {
		return preparedTarget{}, errors.New("目标协议必须是 tcp、icmp、http 或 https")
	}
	path := normalizeTargetPath(kind, req.Path)
	if req.Endpoint != "" {
		host, port, err := splitEndpointForKind(req.Endpoint, kind)
		if err != nil {
			return preparedTarget{}, err
		}
		return preparedTarget{Endpoint: req.Endpoint, Kind: kind, Host: host, Port: port, Path: path}, nil
	}
	if req.Host == "" {
		return preparedTarget{}, errors.New("host is required")
	}
	port := req.Port
	if kind == "icmp" {
		port = 0
	} else {
		if port == 0 {
			if kind == "http" {
				port = 80
			} else if kind == "https" {
				port = 443
			}
		}
		if port <= 0 || port > 65535 {
			return preparedTarget{}, errors.New("valid port is required")
		}
	}
	endpoint := req.Host
	if kind != "icmp" {
		endpoint = net.JoinHostPort(req.Host, strconv.Itoa(port))
	}
	return preparedTarget{Endpoint: endpoint, Kind: kind, Host: req.Host, Port: port, Path: path}, nil
}

func targetEndpoint(req CreateTargetRequest) (string, error) {
	prepared, err := prepareTarget(req)
	return prepared.Endpoint, err
}

func normalizeTargetKind(kind string) string {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "", "tcp":
		return "tcp"
	case "icmp":
		return "icmp"
	case "http", "https":
		return strings.ToLower(strings.TrimSpace(kind))
	default:
		return ""
	}
}

func normalizeTargetPath(kind string, path string) string {
	kind = normalizeTargetKind(kind)
	if kind != "http" && kind != "https" {
		return ""
	}
	path = strings.TrimSpace(path)
	if path == "" {
		return "/"
	}
	if !strings.HasPrefix(path, "/") {
		return "/" + path
	}
	return path
}

func splitEndpointForKind(endpoint string, kind string) (string, int, error) {
	if normalizeTargetKind(kind) == "icmp" {
		return endpoint, 0, nil
	}
	return splitEndpoint(endpoint)
}

func boolToInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func agentSystemdUnit() string {
	return `[Unit]
Description=Wiki Kele outbound probe agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/wiki-probe-agent -config /etc/wiki-probe-agent.json
Restart=always
RestartSec=5s
DynamicUser=yes
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadOnlyPaths=/etc/wiki-probe-agent.json

[Install]
WantedBy=multi-user.target
`
}

func agentInstallCommand() string {
	return `sudo install -m 0644 wiki-probe-agent.service /etc/systemd/system/wiki-probe-agent.service && sudo install -m 0600 wiki-probe-agent.json /etc/wiki-probe-agent.json && sudo systemctl daemon-reload && sudo systemctl enable --now wiki-probe-agent.service`
}

func agentOneLineInstall(agentID, token, hubURL, releaseBaseURL string) string {
	releaseBaseURL = strings.TrimRight(releaseBaseURL, "/")
	return fmt.Sprintf("curl -fsSL %s | sudo AGENT_ID=%s TOKEN=%s HUB_URL=%s bash", shellQuote(releaseBaseURL+"/install.sh"), shellQuote(agentID), shellQuote(token), shellQuote(hubURL))
}

func agentOneLineUninstall(releaseBaseURL string) string {
	releaseBaseURL = strings.TrimRight(releaseBaseURL, "/")
	return fmt.Sprintf("curl -fsSL %s | sudo bash", shellQuote(releaseBaseURL+"/uninstall.sh"))
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
}

func agentConfigJSON(agentID, token, hubURL string) string {
	return fmt.Sprintf(`{
  "agent_id": %q,
  "hub_url": %q,
  "token": %q,
  "poll_interval_seconds": 30,
  "report_interval_seconds": 30,
  "tcp_timeout_ms": 3000,
  "insecure_skip_verify": false
}`, agentID, hubURL, token)
}

func derivedSourceStatus(lastReportedAt string, now time.Time) string {
	value := strings.TrimSpace(lastReportedAt)
	if value == "" {
		return "pending"
	}
	reportedAt, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return "offline"
	}
	age := now.Sub(reportedAt)
	if age < 0 {
		age = 0
	}
	if age < 90*time.Second {
		return "online"
	}
	if age < 5*time.Minute {
		return "warn"
	}
	return "offline"
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

func newLGJobID() (string, error) {
	random := make([]byte, 16)
	if _, err := rand.Read(random); err != nil {
		return "", err
	}
	return "lg_" + hex.EncodeToString(random), nil
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
