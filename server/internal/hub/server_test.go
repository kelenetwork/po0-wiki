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
		"host":     true,
		"ip":       true,
		"address":  true,
		"port":     true,
		"endpoint": true,
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
	assertObjectHasKeys(t, targets[0], "id", "display_name", "region", "tags", "status", "updated_at")
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
