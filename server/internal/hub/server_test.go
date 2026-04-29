package hub

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func newTestServer(t *testing.T) *Server {
	t.Helper()
	store, err := OpenStore(":memory:")
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })
	if err := store.Migrate(context.Background()); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if err := store.SeedDemo(context.Background()); err != nil {
		t.Fatalf("seed: %v", err)
	}
	return NewServer(store, "test-token")
}

func TestHealthz(t *testing.T) {
	server := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()

	server.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	if strings.TrimSpace(rec.Body.String()) != `{"ok":true}` {
		t.Fatalf("body = %s", rec.Body.String())
	}
}

func TestPublicSnapshotOmitsPrivateEndpointFields(t *testing.T) {
	server := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/public/probes/snapshot", nil)
	rec := httptest.NewRecorder()

	server.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s", rec.Code, rec.Body.String())
	}
	var snapshot map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &snapshot); err != nil {
		t.Fatalf("decode snapshot: %v", err)
	}
	assertPublicSnapshotSchema(t, snapshot)
	forbiddenKeys := map[string]bool{
		"host":       true,
		"ip":         true,
		"address":    true,
		"port":       true,
		"endpoint":   true,
		"path":       true,
		"last_error": true,
	}
	assertNoForbiddenKeys(t, snapshot, forbiddenKeys)
	body := rec.Body.String()
	for _, privateValue := range []string{"probe-a.example.test", "probe-b.example.test", "probe-c.example.test", "docs.example.test", "api.example.test"} {
		if strings.Contains(body, privateValue) {
			t.Fatalf("snapshot leaked private endpoint value %q in %s", privateValue, body)
		}
	}
}

func assertPublicSnapshotSchema(t *testing.T, snapshot map[string]any) {
	t.Helper()
	for _, key := range []string{"sources", "targets", "checks", "series"} {
		if _, ok := snapshot[key]; !ok {
			t.Fatalf("snapshot missing %q", key)
		}
	}
	for _, key := range []string{"displayName", "generatedAt", "intervalSeconds"} {
		if _, ok := snapshot[key]; ok {
			t.Fatalf("snapshot has camelCase top-level key %q", key)
		}
	}
	sources, ok := snapshot["sources"].([]any)
	if !ok || len(sources) == 0 {
		t.Fatalf("sources must be a non-empty array")
	}
	assertObjectHasKeys(t, sources[0], "id", "display_name", "region", "tags", "status", "updated_at")
	targets, ok := snapshot["targets"].([]any)
	if !ok || len(targets) == 0 {
		t.Fatalf("targets must be a non-empty array")
	}
	assertObjectHasKeys(t, targets[0], "id", "display_name", "region", "tags", "status", "kind", "updated_at")
	checks, ok := snapshot["checks"].([]any)
	if !ok || len(checks) == 0 {
		t.Fatalf("checks must be a non-empty array")
	}
	check := assertObjectHasKeys(t, checks[0], "id", "display_name", "source_id", "target_id", "tags", "status", "latency_ms", "loss_pct", "jitter_ms", "updated_at")
	for _, key := range []string{"id", "source_id", "target_id"} {
		if _, ok := check[key].(string); !ok {
			t.Fatalf("checks[0].%s must be a string", key)
		}
	}
	series, ok := snapshot["series"].([]any)
	if !ok {
		t.Fatalf("series must be an array")
	}
	if len(series) > 0 {
		item := assertObjectHasKeys(t, series[0], "check_id", "points")
		points, ok := item["points"].([]any)
		if !ok {
			t.Fatalf("series[0].points must be an array")
		}
		if len(points) > 0 {
			assertObjectHasKeys(t, points[0], "updated_at", "latency_ms", "loss_pct", "jitter_ms")
		}
	}
}

func assertObjectHasKeys(t *testing.T, value any, keys ...string) map[string]any {
	t.Helper()
	object, ok := value.(map[string]any)
	if !ok {
		t.Fatalf("value must be an object")
	}
	for _, key := range keys {
		if _, ok := object[key]; !ok {
			t.Fatalf("object missing %q", key)
		}
	}
	return object
}

func TestAdminRequiresBearerTokenAndCreatesSource(t *testing.T) {
	server := newTestServer(t)
	body := strings.NewReader(`{"id":"src-new","display_name":"New Alias","region":"test","tags":["admin"],"endpoint":"private.example.test:9443"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/admin/sources", body)
	rec := httptest.NewRecorder()

	server.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("unauthorized status = %d", rec.Code)
	}

	body = strings.NewReader(`{"id":"src-new","display_name":"New Alias","region":"test","tags":["admin"],"endpoint":"private.example.test:9443"}`)
	req = httptest.NewRequest(http.MethodPost, "/api/admin/sources", body)
	req.Header.Set("Authorization", "Bearer test-token")
	rec = httptest.NewRecorder()

	server.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("created status = %d body = %s", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), "private.example.test") || strings.Contains(rec.Body.String(), "endpoint") {
		t.Fatalf("admin create response leaked private endpoint: %s", rec.Body.String())
	}
}

func TestAdminUpdateAndDeleteResources(t *testing.T) {
	server := newTestServer(t)

	body := strings.NewReader(`{"display_name":"上海电信入口更新","region":"华东","tags":["updated"]}`)
	req := httptest.NewRequest(http.MethodPut, "/api/admin/sources/src-shanghai-ctc", body)
	req.Header.Set("Authorization", "Bearer test-token")
	rec := httptest.NewRecorder()
	server.Routes().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("update source status = %d body = %s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/admin/sources", nil)
	req.Header.Set("Authorization", "Bearer test-token")
	rec = httptest.NewRecorder()
	server.Routes().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("list sources status = %d body = %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "上海电信入口更新") || strings.Count(rec.Body.String(), "src-shanghai-ctc") != 1 {
		t.Fatalf("source was not updated in place: %s", rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodDelete, "/api/admin/sources/src-shanghai-ctc", nil)
	req.Header.Set("Authorization", "Bearer test-token")
	rec = httptest.NewRecorder()
	server.Routes().ServeHTTP(rec, req)
	if rec.Code != http.StatusConflict || !strings.Contains(rec.Body.String(), "请先删除关联任务") {
		t.Fatalf("delete related source status = %d body = %s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodDelete, "/api/admin/targets/tgt-wiki", nil)
	req.Header.Set("Authorization", "Bearer test-token")
	rec = httptest.NewRecorder()
	server.Routes().ServeHTTP(rec, req)
	if rec.Code != http.StatusConflict || !strings.Contains(rec.Body.String(), "请先删除关联任务") {
		t.Fatalf("delete related target status = %d body = %s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodDelete, "/api/admin/checks/chk-shanghai-wiki", nil)
	req.Header.Set("Authorization", "Bearer test-token")
	rec = httptest.NewRecorder()
	server.Routes().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("delete check status = %d body = %s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/admin/checks", nil)
	req.Header.Set("Authorization", "Bearer test-token")
	rec = httptest.NewRecorder()
	server.Routes().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || strings.Contains(rec.Body.String(), "chk-shanghai-wiki") {
		t.Fatalf("deleted check still listed: status = %d body = %s", rec.Code, rec.Body.String())
	}
}

func TestAdminDeleteAgentKeepsSource(t *testing.T) {
	server := newTestServer(t)

	body := strings.NewReader(`{"id":"src-shanghai-ctc"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/admin/agents", body)
	req.Header.Set("Authorization", "Bearer test-token")
	rec := httptest.NewRecorder()
	server.Routes().ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create agent status = %d body = %s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodDelete, "/api/admin/agents/src-shanghai-ctc", nil)
	req.Header.Set("Authorization", "Bearer test-token")
	rec = httptest.NewRecorder()
	server.Routes().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("delete agent status = %d body = %s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/admin/agents", nil)
	req.Header.Set("Authorization", "Bearer test-token")
	rec = httptest.NewRecorder()
	server.Routes().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || strings.Contains(rec.Body.String(), "src-shanghai-ctc") {
		t.Fatalf("deleted agent still listed: status = %d body = %s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/admin/sources", nil)
	req.Header.Set("Authorization", "Bearer test-token")
	rec = httptest.NewRecorder()
	server.Routes().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "src-shanghai-ctc") {
		t.Fatalf("source missing after deleting agent: status = %d body = %s", rec.Code, rec.Body.String())
	}
}

func TestTargetKindICMPInPublicSnapshotWithoutPrivateFields(t *testing.T) {
	server := newTestServer(t)
	body := strings.NewReader(`{"id":"tgt-ping","display_name":"Ping Target","kind":"icmp","host":"icmp.example.test"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/admin/targets", body)
	req.Header.Set("Authorization", "Bearer test-token")
	rec := httptest.NewRecorder()
	server.Routes().ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create icmp target status = %d body = %s", rec.Code, rec.Body.String())
	}
	req = httptest.NewRequest(http.MethodGet, "/api/public/probes/snapshot", nil)
	rec = httptest.NewRecorder()
	server.Routes().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("snapshot status = %d body = %s", rec.Code, rec.Body.String())
	}
	var snapshot map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &snapshot); err != nil {
		t.Fatalf("decode snapshot: %v", err)
	}
	targets, _ := snapshot["targets"].([]any)
	found := false
	for _, raw := range targets {
		target, _ := raw.(map[string]any)
		if target["id"] == "tgt-ping" {
			found = true
			if target["kind"] != "icmp" {
				t.Fatalf("target kind = %v", target["kind"])
			}
		}
	}
	if !found {
		t.Fatalf("icmp target missing from snapshot: %s", rec.Body.String())
	}
	assertNoForbiddenKeys(t, snapshot, map[string]bool{"host": true, "port": true, "path": true, "endpoint": true})
}

func assertNoForbiddenKeys(t *testing.T, value any, forbidden map[string]bool) {
	t.Helper()
	switch typed := value.(type) {
	case map[string]any:
		for key, child := range typed {
			if forbidden[strings.ToLower(key)] {
				t.Fatalf("forbidden key %q present", key)
			}
			assertNoForbiddenKeys(t, child, forbidden)
		}
	case []any:
		for _, child := range typed {
			assertNoForbiddenKeys(t, child, forbidden)
		}
	}
}

func TestSlugifyAndGeneratedIDs(t *testing.T) {
	cases := []struct {
		name string
		want string
	}{
		{name: "New Source 01", want: "src-new-source-01"},
		{name: "  ", want: "src-item"},
		{name: "香港入口", want: "src-item"},
		{name: "A_B ! C", want: "src-a-b-c"},
	}
	for _, tc := range cases {
		if got := slugify("src", tc.name); got != tc.want {
			t.Fatalf("slugify(%q) = %q, want %q", tc.name, got, tc.want)
		}
	}
}

func TestAdminPostAcceptsNameAndGeneratesUniqueIDs(t *testing.T) {
	server := newTestServer(t)

	for index, want := range []string{"src-new-source", "src-new-source-2"} {
		body := strings.NewReader(`{"name":"New Source","region":"test","tags":["auto"]}`)
		req := httptest.NewRequest(http.MethodPost, "/api/admin/sources", body)
		req.Header.Set("Authorization", "Bearer test-token")
		rec := httptest.NewRecorder()
		server.Routes().ServeHTTP(rec, req)
		if rec.Code != http.StatusCreated {
			t.Fatalf("create source %d status = %d body = %s", index, rec.Code, rec.Body.String())
		}
		var source Source
		if err := json.Unmarshal(rec.Body.Bytes(), &source); err != nil {
			t.Fatalf("decode source: %v", err)
		}
		if source.ID != want || source.DisplayName != "New Source" {
			t.Fatalf("source = %+v, want id %q display New Source", source, want)
		}
	}

	targetBody := strings.NewReader(`{"name":"Wiki Target","kind":"tcp","host":"wiki.example.test","port":443}`)
	req := httptest.NewRequest(http.MethodPost, "/api/admin/targets", targetBody)
	req.Header.Set("Authorization", "Bearer test-token")
	rec := httptest.NewRecorder()
	server.Routes().ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated || !strings.Contains(rec.Body.String(), `"id":"tgt-wiki-target"`) {
		t.Fatalf("create target status = %d body = %s", rec.Code, rec.Body.String())
	}

	checkBody := strings.NewReader(`{"name":"New Source to Wiki Target","enabled":true}`)
	req = httptest.NewRequest(http.MethodPost, "/api/admin/checks", checkBody)
	req.Header.Set("Authorization", "Bearer test-token")
	rec = httptest.NewRecorder()
	server.Routes().ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated || !strings.Contains(rec.Body.String(), `"id":"chk-new-source-to-wiki-target"`) {
		t.Fatalf("create check status = %d body = %s", rec.Code, rec.Body.String())
	}
}

func TestAgentPollReportUpdatesPublicSnapshot(t *testing.T) {
	server := newTestServer(t)

	createAgent := strings.NewReader(`{"id":"src-shanghai-ctc"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/admin/agents", createAgent)
	req.Header.Set("Authorization", "Bearer test-token")
	rec := httptest.NewRecorder()
	server.Routes().ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create agent status = %d body = %s", rec.Code, rec.Body.String())
	}
	var created struct {
		Token string `json:"token"`
		Agent Agent  `json:"agent"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode create agent: %v", err)
	}
	if created.Token == "" || created.Agent.ID != "src-shanghai-ctc" {
		t.Fatalf("created = %+v", created)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/admin/agents", nil)
	req.Header.Set("Authorization", "Bearer test-token")
	rec = httptest.NewRecorder()
	server.Routes().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("list agents status = %d body = %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), created.Token) || strings.Contains(rec.Body.String(), "token_hash") {
		t.Fatalf("list agents did not expose token safely: %s", rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/admin/agents/src-shanghai-ctc/install", nil)
	req.Header.Set("Authorization", "Bearer test-token")
	rec = httptest.NewRecorder()
	server.Routes().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), created.Token) || !strings.Contains(rec.Body.String(), "systemd_unit") || !strings.Contains(rec.Body.String(), "config_json") || !strings.Contains(rec.Body.String(), "install_command") || !strings.Contains(rec.Body.String(), "one_line") || !strings.Contains(rec.Body.String(), "one_line_uninstall") {
		t.Fatalf("install response status = %d body = %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "https://github.com/kelenetwork/po0-wiki/releases/latest/download/install.sh") || !strings.Contains(rec.Body.String(), "https://github.com/kelenetwork/po0-wiki/releases/latest/download/uninstall.sh") {
		t.Fatalf("install response did not use public release URLs: %s", rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "AGENT_ID='src-shanghai-ctc'") || !strings.Contains(rec.Body.String(), "TOKEN='"+created.Token+"'") || !strings.Contains(rec.Body.String(), "HUB_URL='https://wiki.kele.my/api/agent'") || strings.Contains(rec.Body.String(), "INSTALL_TOKEN") || strings.Contains(rec.Body.String(), "/api/install/") {
		t.Fatalf("install response one-line command is invalid: %s", rec.Body.String())
	}

	pollBody := strings.NewReader(`{"agent_id":"src-shanghai-ctc","version":"test","hostname":"unit"}`)
	req = httptest.NewRequest(http.MethodPost, "/api/agent/poll", pollBody)
	req.Header.Set("Authorization", "Bearer "+created.Token)
	rec = httptest.NewRecorder()
	server.Routes().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("poll status = %d body = %s", rec.Code, rec.Body.String())
	}
	var polled struct {
		Checks []AgentCheck `json:"checks"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &polled); err != nil {
		t.Fatalf("decode poll: %v", err)
	}
	if _, err := server.store.CreateTarget(context.Background(), CreateTargetRequest{ID: "tgt-agent-icmp", DisplayName: "Agent ICMP", Kind: "icmp", Host: "icmp.example.test"}); err != nil {
		t.Fatalf("create icmp target: %v", err)
	}
	if _, err := server.store.CreateTarget(context.Background(), CreateTargetRequest{ID: "tgt-agent-http", DisplayName: "Agent HTTP", Kind: "http", Host: "http.example.test", Port: 8080, Path: "/healthz"}); err != nil {
		t.Fatalf("create http target: %v", err)
	}
	if _, err := server.store.CreateTarget(context.Background(), CreateTargetRequest{ID: "tgt-agent-https", DisplayName: "Agent HTTPS", Kind: "https", Host: "https.example.test", Port: 8443, Path: "/healthz"}); err != nil {
		t.Fatalf("create https target: %v", err)
	}
	if _, err := server.store.CreateCheck(context.Background(), CreateCheckRequest{ID: "chk-agent-icmp", DisplayName: "Agent ICMP", SourceID: "src-shanghai-ctc", TargetID: "tgt-agent-icmp"}); err != nil {
		t.Fatalf("create icmp check: %v", err)
	}
	if _, err := server.store.CreateCheck(context.Background(), CreateCheckRequest{ID: "chk-agent-http", DisplayName: "Agent HTTP", SourceID: "src-shanghai-ctc", TargetID: "tgt-agent-http"}); err != nil {
		t.Fatalf("create http check: %v", err)
	}
	if _, err := server.store.CreateCheck(context.Background(), CreateCheckRequest{ID: "chk-agent-https", DisplayName: "Agent HTTPS", SourceID: "src-shanghai-ctc", TargetID: "tgt-agent-https"}); err != nil {
		t.Fatalf("create https check: %v", err)
	}

	pollBody = strings.NewReader(`{"agent_id":"src-shanghai-ctc","version":"test","hostname":"unit"}`)
	req = httptest.NewRequest(http.MethodPost, "/api/agent/poll", pollBody)
	req.Header.Set("Authorization", "Bearer "+created.Token)
	rec = httptest.NewRecorder()
	server.Routes().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("poll status = %d body = %s", rec.Code, rec.Body.String())
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &polled); err != nil {
		t.Fatalf("decode poll: %v", err)
	}
	byID := map[string]AgentCheck{}
	for _, check := range polled.Checks {
		byID[check.CheckID] = check
	}
	if check := byID["chk-shanghai-wiki"]; check.Kind != "tcp" || check.Host == "" || check.Port == 0 || check.Path != "" {
		t.Fatalf("tcp poll check = %+v", check)
	}
	if check := byID["chk-agent-icmp"]; check.Kind != "icmp" || check.Host != "icmp.example.test" || check.Port != 0 || check.Path != "" {
		t.Fatalf("icmp poll check = %+v", check)
	}
	if check := byID["chk-agent-http"]; check.Kind != "http" || check.Host != "http.example.test" || check.Port != 8080 || check.Path != "/healthz" {
		t.Fatalf("http poll check = %+v", check)
	}
	if check := byID["chk-agent-https"]; check.Kind != "https" || check.Host != "https.example.test" || check.Port != 8443 || check.Path != "/healthz" {
		t.Fatalf("https poll check = %+v", check)
	}

	reportBody := strings.NewReader(`{"agent_id":"src-shanghai-ctc","results":[{"check_id":"chk-shanghai-wiki","tcp_connect_ms":12.3,"loss":0,"jitter_ms":1.2,"status":"fail","error":"tls handshake failed","observed_at":"2026-04-30T00:00:00Z"}]}`)
	req = httptest.NewRequest(http.MethodPost, "/api/agent/report", reportBody)
	req.Header.Set("Authorization", "Bearer "+created.Token)
	rec = httptest.NewRecorder()
	server.Routes().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("report status = %d body = %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"accepted":1`) {
		t.Fatalf("report body = %s", rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/admin/checks", nil)
	req.Header.Set("Authorization", "Bearer test-token")
	rec = httptest.NewRecorder()
	server.Routes().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"last_error":"tls handshake failed"`) {
		t.Fatalf("admin checks missing last_error: status = %d body = %s", rec.Code, rec.Body.String())
	}

	reportBody = strings.NewReader(`{"agent_id":"src-shanghai-ctc","results":[{"check_id":"chk-shanghai-wiki","tcp_connect_ms":12.3,"loss":0,"jitter_ms":1.2,"status":"ok","observed_at":"2026-04-30T00:00:01Z"}]}`)
	req = httptest.NewRequest(http.MethodPost, "/api/agent/report", reportBody)
	req.Header.Set("Authorization", "Bearer "+created.Token)
	rec = httptest.NewRecorder()
	server.Routes().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("ok report status = %d body = %s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/admin/checks", nil)
	req.Header.Set("Authorization", "Bearer test-token")
	rec = httptest.NewRecorder()
	server.Routes().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"last_error":""`) || strings.Contains(rec.Body.String(), "tls handshake failed") {
		t.Fatalf("admin checks did not clear last_error: status = %d body = %s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/public/probes/snapshot", nil)
	rec = httptest.NewRecorder()
	server.Routes().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("snapshot status = %d body = %s", rec.Code, rec.Body.String())
	}
	var snapshot Snapshot
	if err := json.Unmarshal(rec.Body.Bytes(), &snapshot); err != nil {
		t.Fatalf("decode snapshot: %v", err)
	}
	found := false
	for _, check := range snapshot.Checks {
		if check.ID == "chk-shanghai-wiki" {
			found = true
			if check.LatencyMS != 12.3 || check.LossPct != 0 || check.JitterMS != 1.2 || check.Status != "ok" {
				t.Fatalf("updated check = %+v", check)
			}
		}
	}
	if !found {
		t.Fatalf("updated check not found")
	}
	forbiddenKeys := map[string]bool{"host": true, "ip": true, "address": true, "port": true, "endpoint": true, "path": true, "last_error": true}
	var public map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &public); err != nil {
		t.Fatalf("decode public map: %v", err)
	}
	assertNoForbiddenKeys(t, public, forbiddenKeys)
}
