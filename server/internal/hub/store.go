package hub

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
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
	LatencyMS   int      `json:"latency_ms"`
	LossPct     float64  `json:"loss_pct"`
	JitterMS    int      `json:"jitter_ms"`
	UpdatedAt   string   `json:"updated_at"`
}

type SeriesPoint struct {
	UpdatedAt string  `json:"updated_at"`
	LatencyMS int     `json:"latency_ms"`
	LossPct   float64 `json:"loss_pct"`
	JitterMS  int     `json:"jitter_ms"`
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
	ID          string   `json:"id"`
	DisplayName string   `json:"display_name"`
	SourceID    string   `json:"source_id"`
	TargetID    string   `json:"target_id"`
	Tags        []string `json:"tags"`
	Status      string   `json:"status"`
	LatencyMS   int      `json:"latency_ms"`
	LossPct     float64  `json:"loss_pct"`
	JitterMS    int      `json:"jitter_ms"`
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
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS series_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  check_id TEXT NOT NULL REFERENCES checks(id),
  latency_ms INTEGER NOT NULL,
  loss_pct REAL NOT NULL,
  jitter_ms INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
`)
	return err
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
				check.ID, check.LatencyMS-point*3, check.LossPct, check.JitterMS+point, now.Add(-time.Duration(point)*time.Minute).Format(time.RFC3339))
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
	_, err := execer.ExecContext(ctx, `INSERT INTO checks (id, display_name, source_id, target_id, tags, status, latency_ms, loss_pct, jitter_ms, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, req.ID, req.DisplayName, req.SourceID, req.TargetID, encodeTags(req.Tags), defaultCheckStatus(req.Status), req.LatencyMS, req.LossPct, req.JitterMS, updatedAt)
	return err
}

func defaultStatus(status string) string {
	if status == "" {
		return "online"
	}
	return status
}

func defaultCheckStatus(status string) string {
	if status == "" {
		return "ok"
	}
	return status
}
