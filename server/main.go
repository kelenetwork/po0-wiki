package main

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

type source struct {
	ID          int64  `json:"id"`
	DisplayName string `json:"displayName"`
	Region      string `json:"region"`
	Provider    string `json:"provider"`
	RoutingTags string `json:"routingTags"`
	Status      string `json:"status"`
	Load        string `json:"load"`
	AgentToken  string `json:"agentToken,omitempty"`
}
type target struct {
	ID          int64  `json:"id"`
	DisplayName string `json:"displayName"`
	Region      string `json:"region"`
	Provider    string `json:"provider"`
	RoutingTags string `json:"routingTags"`
	Host        string `json:"host,omitempty"`
	Port        int    `json:"port,omitempty"`
}
type check struct {
	ID              int64 `json:"id"`
	SourceID        int64 `json:"sourceId"`
	TargetID        int64 `json:"targetId"`
	IntervalSeconds int   `json:"intervalSeconds"`
	Enabled         bool  `json:"enabled"`
}
type publicCheck struct {
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
type publicSource struct {
	ID          string   `json:"id"`
	DisplayName string   `json:"display_name"`
	Region      string   `json:"region"`
	Tags        []string `json:"tags"`
	Status      string   `json:"status"`
	UpdatedAt   string   `json:"updated_at"`
}
type publicTarget struct {
	ID          string   `json:"id"`
	DisplayName string   `json:"display_name"`
	Region      string   `json:"region"`
	Tags        []string `json:"tags"`
	Status      string   `json:"status"`
	UpdatedAt   string   `json:"updated_at"`
}
type publicSeriesPoint struct {
	UpdatedAt string  `json:"updated_at"`
	LatencyMS float64 `json:"latency_ms"`
	LossPct   float64 `json:"loss_pct"`
	JitterMS  float64 `json:"jitter_ms"`
}
type publicSeries struct {
	CheckID string              `json:"check_id"`
	Points  []publicSeriesPoint `json:"points"`
}
type snapshot struct {
	Sources []publicSource `json:"sources"`
	Targets []publicTarget `json:"targets"`
	Checks  []publicCheck  `json:"checks"`
	Series  []publicSeries `json:"series"`
}

type app struct {
	db         *sql.DB
	adminToken string
}

func main() {
	dbPath := env("WIKI_DB_PATH", env("WIKI_PROBE_DB", "data/wiki-probe.db"))
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		log.Fatal(err)
	}
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	a := &app{db: db, adminToken: os.Getenv("WIKI_ADMIN_TOKEN")}
	if a.adminToken == "" {
		a.adminToken = "dev-change-me"
	}
	if err := a.migrate(context.Background()); err != nil {
		log.Fatal(err)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", a.healthz)
	mux.HandleFunc("/api/healthz", a.healthz)
	mux.HandleFunc("/api/public/probes/snapshot", a.publicSnapshot)
	mux.HandleFunc("/api/public/probes/stream", a.publicStream)
	mux.HandleFunc("/api/agent/poll", a.agentPoll)
	mux.HandleFunc("/api/agent/report", a.agentReport)
	mux.HandleFunc("/api/admin/sources", a.sources)
	mux.HandleFunc("/api/admin/sources/", a.sourceByID)
	mux.HandleFunc("/api/admin/targets", a.targets)
	mux.HandleFunc("/api/admin/targets/", a.targetByID)
	mux.HandleFunc("/api/admin/checks", a.checks)
	mux.HandleFunc("/api/admin/checks/", a.checkByID)
	mux.HandleFunc("/api/admin/agents/token", a.agentToken)
	addr := env("WIKI_HUB_ADDR", env("WIKI_PROBE_ADDR", ":3331"))
	log.Printf("probe hub listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, withCORS(mux)))
}

func (a *app) migrate(ctx context.Context) error {
	ddl := "CREATE TABLE IF NOT EXISTS sources (id INTEGER PRIMARY KEY AUTOINCREMENT, display_name TEXT NOT NULL, region TEXT NOT NULL, provider TEXT NOT NULL DEFAULT '', routing_tags TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', load TEXT NOT NULL DEFAULT '待接入', agent_token TEXT NOT NULL UNIQUE, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);" +
		"CREATE TABLE IF NOT EXISTS targets (id INTEGER PRIMARY KEY AUTOINCREMENT, display_name TEXT NOT NULL, region TEXT NOT NULL, provider TEXT NOT NULL DEFAULT '', routing_tags TEXT NOT NULL DEFAULT '', host TEXT NOT NULL, port INTEGER NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);" +
		"CREATE TABLE IF NOT EXISTS checks (id INTEGER PRIMARY KEY AUTOINCREMENT, source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE, target_id INTEGER NOT NULL REFERENCES targets(id) ON DELETE CASCADE, interval_seconds INTEGER NOT NULL DEFAULT 30, enabled INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(source_id,target_id));" +
		"CREATE TABLE IF NOT EXISTS results (id INTEGER PRIMARY KEY AUTOINCREMENT, check_id INTEGER NOT NULL REFERENCES checks(id) ON DELETE CASCADE, status TEXT NOT NULL, latency_ms REAL, jitter_ms REAL, loss_percent REAL, error TEXT NOT NULL DEFAULT '', checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);"
	if _, err := a.db.ExecContext(ctx, ddl); err != nil {
		return err
	}
	var n int
	if err := a.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM sources").Scan(&n); err != nil || n > 0 {
		return err
	}
	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	sources := []source{{DisplayName: "上海电信入口", Region: "华东", Provider: "CTC", RoutingTags: "CN2 / 出站探测", Status: "pending", Load: "待上报", AgentToken: token()}, {DisplayName: "RFC CTC", Region: "华南", Provider: "CTC", RoutingTags: "BGP / 备用线路", Status: "pending", Load: "待上报", AgentToken: token()}, {DisplayName: "CN-A 采集点", Region: "华北", Provider: "Multi-ISP", RoutingTags: "联通 / 移动观测", Status: "pending", Load: "待上报", AgentToken: token()}}
	targets := []target{{DisplayName: "Wiki 主站", Region: "边缘入口", Provider: "HTTPS", RoutingTags: "站点可用性", Host: "wiki.kele.my", Port: 443}, {DisplayName: "API 入口", Region: "中心端", Provider: "HTTPS", RoutingTags: "控制面", Host: "wiki.kele.my", Port: 443}, {DisplayName: "静态资源", Region: "CDN", Provider: "HTTPS", RoutingTags: "前端资源", Host: "wiki.kele.my", Port: 443}}
	for _, s := range sources {
		if _, err := tx.ExecContext(ctx, "INSERT INTO sources(display_name,region,provider,routing_tags,status,load,agent_token) VALUES(?,?,?,?,?,?,?)", s.DisplayName, s.Region, s.Provider, s.RoutingTags, s.Status, s.Load, s.AgentToken); err != nil {
			return err
		}
	}
	for _, t := range targets {
		if _, err := tx.ExecContext(ctx, "INSERT INTO targets(display_name,region,provider,routing_tags,host,port) VALUES(?,?,?,?,?,?)", t.DisplayName, t.Region, t.Provider, t.RoutingTags, t.Host, t.Port); err != nil {
			return err
		}
	}
	for sid := 1; sid <= len(sources); sid++ {
		for tid := 1; tid <= len(targets); tid++ {
			if _, err := tx.ExecContext(ctx, "INSERT INTO checks(source_id,target_id,interval_seconds,enabled) VALUES(?,?,30,1)", sid, tid); err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}

func (a *app) healthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, 200, map[string]bool{"ok": true})
}
func (a *app) publicSnapshot(w http.ResponseWriter, r *http.Request) {
	snap, err := a.snapshot(r.Context())
	if err != nil {
		writeError(w, 500, err)
		return
	}
	writeJSON(w, 200, snap)
}
func (a *app) publicStream(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, 500, errors.New("stream unsupported"))
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	tick := time.NewTicker(5 * time.Second)
	defer tick.Stop()
	for {
		snap, err := a.snapshot(r.Context())
		if err == nil {
			b, _ := json.Marshal(snap)
			fmt.Fprintf(w, "event: snapshot\ndata: %s\n\n", b)
			flusher.Flush()
		}
		select {
		case <-r.Context().Done():
			return
		case <-tick.C:
		}
	}
}

func (a *app) snapshot(ctx context.Context) (snapshot, error) {
	snap := snapshot{Sources: []publicSource{}, Targets: []publicTarget{}, Checks: []publicCheck{}, Series: []publicSeries{}}
	rows, err := a.db.QueryContext(ctx, "SELECT id,display_name,region,provider,routing_tags,status,updated_at FROM sources ORDER BY id")
	if err != nil {
		return snap, err
	}
	for rows.Next() {
		var id int64
		var displayName, region, provider, routingTags, status, updatedAt string
		if err := rows.Scan(&id, &displayName, &region, &provider, &routingTags, &status, &updatedAt); err != nil {
			rows.Close()
			return snap, err
		}
		snap.Sources = append(snap.Sources, publicSource{ID: publicID("src", id, displayName, provider), DisplayName: displayName, Region: region, Tags: publicTags(provider, routingTags), Status: status, UpdatedAt: updatedAt})
	}
	rows.Close()
	rows, err = a.db.QueryContext(ctx, "SELECT id,display_name,region,provider,routing_tags,updated_at FROM targets ORDER BY id")
	if err != nil {
		return snap, err
	}
	for rows.Next() {
		var id int64
		var displayName, region, provider, routingTags, updatedAt string
		if err := rows.Scan(&id, &displayName, &region, &provider, &routingTags, &updatedAt); err != nil {
			rows.Close()
			return snap, err
		}
		snap.Targets = append(snap.Targets, publicTarget{ID: publicID("tgt", id, displayName, provider), DisplayName: displayName, Region: region, Tags: publicTags(provider, routingTags), Status: "online", UpdatedAt: updatedAt})
	}
	rows.Close()
	q := "SELECT c.id,s.id,s.display_name,s.provider,s.routing_tags,t.id,t.display_name,t.provider,t.routing_tags,COALESCE(r.status,'pending'),r.latency_ms,r.loss_percent,r.jitter_ms,COALESCE(r.checked_at,c.updated_at) FROM checks c JOIN sources s ON s.id=c.source_id JOIN targets t ON t.id=c.target_id LEFT JOIN results r ON r.id=(SELECT id FROM results WHERE check_id=c.id ORDER BY checked_at DESC,id DESC LIMIT 1) WHERE c.enabled=1 ORDER BY c.id"
	rows, err = a.db.QueryContext(ctx, q)
	if err != nil {
		return snap, err
	}
	defer rows.Close()
	for rows.Next() {
		var checkID, sourceID, targetID int64
		var sourceName, sourceProvider, sourceRoutingTags, targetName, targetProvider, targetRoutingTags string
		var status, updatedAt string
		var latency, jitter, loss sql.NullFloat64
		if err := rows.Scan(&checkID, &sourceID, &sourceName, &sourceProvider, &sourceRoutingTags, &targetID, &targetName, &targetProvider, &targetRoutingTags, &status, &latency, &loss, &jitter, &updatedAt); err != nil {
			return snap, err
		}
		sourcePublicID := publicID("src", sourceID, sourceName, sourceProvider)
		targetPublicID := publicID("tgt", targetID, targetName, targetProvider)
		c := publicCheck{ID: checkIDFromEndpoints(checkID, sourcePublicID, targetPublicID), DisplayName: sourceName + " → " + targetName, SourceID: sourcePublicID, TargetID: targetPublicID, Tags: publicTags(sourceProvider, sourceRoutingTags, targetProvider, targetRoutingTags), Status: status, UpdatedAt: updatedAt}
		if latency.Valid {
			c.LatencyMS = latency.Float64
		}
		if jitter.Valid {
			c.JitterMS = jitter.Float64
		}
		if loss.Valid {
			c.LossPct = loss.Float64
		}
		snap.Checks = append(snap.Checks, c)
	}
	return snap, nil
}

func publicID(prefix string, id int64, parts ...string) string {
	slug := slugParts(parts...)
	if slug == "" {
		slug = strconv.FormatInt(id, 10)
	}
	return prefix + "-" + slug
}

func checkIDFromEndpoints(id int64, sourceID, targetID string) string {
	sourceSlug := strings.TrimPrefix(sourceID, "src-")
	targetSlug := strings.TrimPrefix(targetID, "tgt-")
	if sourceSlug == "" || targetSlug == "" {
		return publicID("chk", id)
	}
	return "chk-" + sourceSlug + "-" + targetSlug
}

func slugParts(parts ...string) string {
	aliases := map[string]string{
		"上海":   "shanghai ",
		"电信":   "ctc ",
		"入口":   " ",
		"华东":   "east ",
		"华南":   "south ",
		"华北":   "north ",
		"采集点":  " ",
		"主站":   " ",
		"静态资源": "static ",
		"中心端":  "core ",
		"边缘入口": "edge ",
		"控制面":  "control ",
	}
	tokens := []string{}
	for _, part := range parts {
		part = strings.TrimSpace(strings.ToLower(part))
		for from, to := range aliases {
			part = strings.ReplaceAll(part, strings.ToLower(from), to)
		}
		var b strings.Builder
		lastDash := true
		for _, r := range part {
			if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
				b.WriteRune(r)
				lastDash = false
				continue
			}
			if !lastDash {
				b.WriteByte('-')
				lastDash = true
			}
		}
		for _, token := range strings.Split(strings.Trim(b.String(), "-"), "-") {
			if token != "" {
				tokens = append(tokens, token)
			}
		}
	}
	seen := map[string]bool{}
	unique := []string{}
	for _, token := range tokens {
		if seen[token] {
			continue
		}
		seen[token] = true
		unique = append(unique, token)
	}
	return strings.Join(unique, "-")
}

func publicTags(parts ...string) []string {
	seen := map[string]bool{}
	tags := []string{}
	for _, part := range parts {
		for _, tag := range strings.FieldsFunc(part, func(r rune) bool { return r == ',' || r == '/' || r == '|' || r == ';' }) {
			tag = strings.TrimSpace(tag)
			if tag == "" || seen[tag] {
				continue
			}
			seen[tag] = true
			tags = append(tags, tag)
		}
	}
	return tags
}

type pollTask struct {
	CheckID         int64  `json:"checkId"`
	IntervalSeconds int    `json:"intervalSeconds"`
	Target          target `json:"target"`
}

func (a *app) agentPoll(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, 405, errors.New("method not allowed"))
		return
	}
	var req struct {
		Token string `json:"token"`
	}
	if decodeJSON(r, &req) != nil {
		writeError(w, 400, errors.New("invalid JSON body"))
		return
	}
	s, ok, err := a.sourceByToken(r.Context(), req.Token)
	if err != nil {
		writeError(w, 500, err)
		return
	}
	if !ok {
		writeError(w, 401, errors.New("invalid agent token"))
		return
	}
	_, _ = a.db.ExecContext(r.Context(), "UPDATE sources SET status='online',load='轮询中',updated_at=CURRENT_TIMESTAMP WHERE id=?", s.ID)
	rows, err := a.db.QueryContext(r.Context(), "SELECT c.id,c.interval_seconds,t.id,t.display_name,t.region,t.provider,t.routing_tags,t.host,t.port FROM checks c JOIN targets t ON t.id=c.target_id WHERE c.source_id=? AND c.enabled=1 ORDER BY c.id", s.ID)
	if err != nil {
		writeError(w, 500, err)
		return
	}
	defer rows.Close()
	tasks := []pollTask{}
	for rows.Next() {
		var task pollTask
		if err := rows.Scan(&task.CheckID, &task.IntervalSeconds, &task.Target.ID, &task.Target.DisplayName, &task.Target.Region, &task.Target.Provider, &task.Target.RoutingTags, &task.Target.Host, &task.Target.Port); err != nil {
			writeError(w, 500, err)
			return
		}
		tasks = append(tasks, task)
	}
	writeJSON(w, 200, map[string]any{"source": s, "tasks": tasks})
}
func (a *app) agentReport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, 405, errors.New("method not allowed"))
		return
	}
	var req struct {
		Token     string   `json:"token"`
		CheckID   int64    `json:"checkId"`
		OK        bool     `json:"ok"`
		LatencyMS *float64 `json:"latencyMs,omitempty"`
		Error     string   `json:"error,omitempty"`
		CheckedAt string   `json:"checkedAt,omitempty"`
	}
	if decodeJSON(r, &req) != nil {
		writeError(w, 400, errors.New("invalid JSON body"))
		return
	}
	s, ok, err := a.sourceByToken(r.Context(), req.Token)
	if err != nil {
		writeError(w, 500, err)
		return
	}
	if !ok {
		writeError(w, 401, errors.New("invalid agent token"))
		return
	}
	var owner int64
	if err := a.db.QueryRowContext(r.Context(), "SELECT source_id FROM checks WHERE id=?", req.CheckID).Scan(&owner); err != nil {
		writeError(w, 404, errors.New("check not found"))
		return
	}
	if owner != s.ID {
		writeError(w, 403, errors.New("check does not belong to this agent"))
		return
	}
	status, loss := "online", 0.0
	if !req.OK {
		status, loss = "warn", 100
	}
	jitter := sql.NullFloat64{}
	if req.LatencyMS != nil {
		var prev sql.NullFloat64
		_ = a.db.QueryRowContext(r.Context(), "SELECT latency_ms FROM results WHERE check_id=? AND latency_ms IS NOT NULL ORDER BY checked_at DESC,id DESC LIMIT 1", req.CheckID).Scan(&prev)
		if prev.Valid {
			jitter.Valid = true
			jitter.Float64 = abs(prev.Float64 - *req.LatencyMS)
		}
	}
	when := time.Now().UTC().Format(time.RFC3339)
	if req.CheckedAt != "" {
		when = req.CheckedAt
	}
	_, err = a.db.ExecContext(r.Context(), "INSERT INTO results(check_id,status,latency_ms,jitter_ms,loss_percent,error,checked_at) VALUES(?,?,?,?,?,?,?)", req.CheckID, status, nullableFloat(req.LatencyMS), jitter, loss, req.Error, when)
	if err != nil {
		writeError(w, 500, err)
		return
	}
	_, _ = a.db.ExecContext(r.Context(), "UPDATE sources SET status='online',load='刚上报',updated_at=CURRENT_TIMESTAMP WHERE id=?", s.ID)
	writeJSON(w, 200, map[string]bool{"ok": true})
}

func (a *app) sources(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	if r.Method == http.MethodGet {
		a.listSources(w, r)
		return
	}
	if r.Method == http.MethodPost {
		var s source
		if decodeJSON(r, &s) != nil {
			writeError(w, 400, errors.New("invalid JSON body"))
			return
		}
		if s.AgentToken == "" {
			s.AgentToken = token()
		}
		res, err := a.db.ExecContext(r.Context(), "INSERT INTO sources(display_name,region,provider,routing_tags,status,load,agent_token) VALUES(?,?,?,?,?,?,?)", s.DisplayName, s.Region, s.Provider, s.RoutingTags, def(s.Status, "pending"), def(s.Load, "待接入"), s.AgentToken)
		if err != nil {
			writeError(w, 400, err)
			return
		}
		s.ID, _ = res.LastInsertId()
		writeJSON(w, 201, s)
		return
	}
	writeError(w, 405, errors.New("method not allowed"))
}
func (a *app) targets(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	if r.Method == http.MethodGet {
		a.listTargets(w, r)
		return
	}
	if r.Method == http.MethodPost {
		var t target
		if decodeJSON(r, &t) != nil {
			writeError(w, 400, errors.New("invalid JSON body"))
			return
		}
		res, err := a.db.ExecContext(r.Context(), "INSERT INTO targets(display_name,region,provider,routing_tags,host,port) VALUES(?,?,?,?,?,?)", t.DisplayName, t.Region, t.Provider, t.RoutingTags, t.Host, t.Port)
		if err != nil {
			writeError(w, 400, err)
			return
		}
		t.ID, _ = res.LastInsertId()
		writeJSON(w, 201, t)
		return
	}
	writeError(w, 405, errors.New("method not allowed"))
}
func (a *app) checks(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	if r.Method == http.MethodGet {
		a.listChecks(w, r)
		return
	}
	if r.Method == http.MethodPost {
		var c check
		if decodeJSON(r, &c) != nil {
			writeError(w, 400, errors.New("invalid JSON body"))
			return
		}
		if c.IntervalSeconds == 0 {
			c.IntervalSeconds = 30
		}
		res, err := a.db.ExecContext(r.Context(), "INSERT INTO checks(source_id,target_id,interval_seconds,enabled) VALUES(?,?,?,?)", c.SourceID, c.TargetID, c.IntervalSeconds, boolInt(c.Enabled))
		if err != nil {
			writeError(w, 400, err)
			return
		}
		c.ID, _ = res.LastInsertId()
		writeJSON(w, 201, c)
		return
	}
	writeError(w, 405, errors.New("method not allowed"))
}
func (a *app) sourceByID(w http.ResponseWriter, r *http.Request) {
	a.deleteOrUpdate(w, r, "sources", "display_name=?,region=?,provider=?,routing_tags=?,status=?,load=?")
}
func (a *app) targetByID(w http.ResponseWriter, r *http.Request) {
	a.deleteOrUpdate(w, r, "targets", "display_name=?,region=?,provider=?,routing_tags=?,host=?,port=?")
}
func (a *app) checkByID(w http.ResponseWriter, r *http.Request) { a.deleteCheck(w, r) }
func (a *app) agentToken(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	if r.Method != http.MethodPost {
		writeError(w, 405, errors.New("method not allowed"))
		return
	}
	var req struct {
		SourceID int64 `json:"sourceId"`
	}
	if decodeJSON(r, &req) != nil {
		writeError(w, 400, errors.New("invalid JSON body"))
		return
	}
	tok := token()
	_, err := a.db.ExecContext(r.Context(), "UPDATE sources SET agent_token=?,updated_at=CURRENT_TIMESTAMP WHERE id=?", tok, req.SourceID)
	if err != nil {
		writeError(w, 500, err)
		return
	}
	writeJSON(w, 200, map[string]string{"token": tok, "command": "probe-agent -config /etc/wiki-probe-agent/config.json"})
}

func (a *app) listSources(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.QueryContext(r.Context(), "SELECT id,display_name,region,provider,routing_tags,status,load FROM sources ORDER BY id")
	if err != nil {
		writeError(w, 500, err)
		return
	}
	defer rows.Close()
	out := []source{}
	for rows.Next() {
		var s source
		rows.Scan(&s.ID, &s.DisplayName, &s.Region, &s.Provider, &s.RoutingTags, &s.Status, &s.Load)
		out = append(out, s)
	}
	writeJSON(w, 200, out)
}
func (a *app) listTargets(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.QueryContext(r.Context(), "SELECT id,display_name,region,provider,routing_tags,host,port FROM targets ORDER BY id")
	if err != nil {
		writeError(w, 500, err)
		return
	}
	defer rows.Close()
	out := []target{}
	for rows.Next() {
		var t target
		rows.Scan(&t.ID, &t.DisplayName, &t.Region, &t.Provider, &t.RoutingTags, &t.Host, &t.Port)
		out = append(out, t)
	}
	writeJSON(w, 200, out)
}
func (a *app) listChecks(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.QueryContext(r.Context(), "SELECT id,source_id,target_id,interval_seconds,enabled FROM checks ORDER BY id")
	if err != nil {
		writeError(w, 500, err)
		return
	}
	defer rows.Close()
	out := []check{}
	for rows.Next() {
		var c check
		var enabled int
		rows.Scan(&c.ID, &c.SourceID, &c.TargetID, &c.IntervalSeconds, &enabled)
		c.Enabled = enabled == 1
		out = append(out, c)
	}
	writeJSON(w, 200, out)
}
func (a *app) deleteOrUpdate(w http.ResponseWriter, r *http.Request, table, set string) {
	if !a.admin(w, r) {
		return
	}
	id, err := lastID(r.URL.Path)
	if err != nil {
		writeError(w, 400, err)
		return
	}
	if r.Method == http.MethodDelete {
		_, err = a.db.ExecContext(r.Context(), "DELETE FROM "+table+" WHERE id=?", id)
		if err != nil {
			writeError(w, 500, err)
			return
		}
		writeJSON(w, 200, map[string]bool{"ok": true})
		return
	}
	writeError(w, 405, errors.New("method not allowed"))
}
func (a *app) deleteCheck(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	id, err := lastID(r.URL.Path)
	if err != nil {
		writeError(w, 400, err)
		return
	}
	if r.Method == http.MethodDelete {
		_, err = a.db.ExecContext(r.Context(), "DELETE FROM checks WHERE id=?", id)
		if err != nil {
			writeError(w, 500, err)
			return
		}
		writeJSON(w, 200, map[string]bool{"ok": true})
		return
	}
	writeError(w, 405, errors.New("method not allowed"))
}

func (a *app) sourceByToken(ctx context.Context, tok string) (source, bool, error) {
	var s source
	err := a.db.QueryRowContext(ctx, "SELECT id,display_name,region,provider,routing_tags,status,load FROM sources WHERE agent_token=?", tok).Scan(&s.ID, &s.DisplayName, &s.Region, &s.Provider, &s.RoutingTags, &s.Status, &s.Load)
	if errors.Is(err, sql.ErrNoRows) {
		return s, false, nil
	}
	return s, err == nil, err
}
func (a *app) admin(w http.ResponseWriter, r *http.Request) bool {
	tok := r.Header.Get("X-Admin-Token")
	if tok == "" && strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ") {
		tok = strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	}
	if tok != a.adminToken {
		writeError(w, 401, errors.New("unauthorized"))
		return false
	}
	return true
}
func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Admin-Token")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(204)
			return
		}
		next.ServeHTTP(w, r)
	})
}
func decodeJSON(r *http.Request, v any) error {
	defer r.Body.Close()
	return json.NewDecoder(r.Body).Decode(v)
}
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}
func env(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}
func def(v, d string) string {
	if v != "" {
		return v
	}
	return d
}
func boolInt(v bool) int {
	if v {
		return 1
	}
	return 0
}
func nullableFloat(v *float64) any {
	if v == nil {
		return nil
	}
	return *v
}
func abs(v float64) float64 {
	if v < 0 {
		return -v
	}
	return v
}
func lastID(path string) (int64, error) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	return strconv.ParseInt(parts[len(parts)-1], 10, 64)
}
func token() string {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}
