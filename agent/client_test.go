package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestClientPollReportHappyPath(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer tok" {
			t.Fatalf("missing auth header")
		}
		switch r.URL.Path {
		case "/poll":
			_ = json.NewEncoder(w).Encode(map[string]any{"checks": []Check{{CheckID: "chk-1", Host: "example.test", Port: 443, IntervalSeconds: 30}}})
		case "/report":
			_ = json.NewEncoder(w).Encode(map[string]int{"accepted": 1})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	c := newClient(Config{HubURL: server.URL, Token: "tok"})
	checks, err := c.poll(context.Background(), "src-1", "v", "host")
	if err != nil {
		t.Fatalf("poll: %v", err)
	}
	if len(checks) != 1 || checks[0].CheckID != "chk-1" {
		t.Fatalf("checks = %+v", checks)
	}
	accepted, err := c.report(context.Background(), "src-1", []Result{{CheckID: "chk-1", Status: "ok"}})
	if err != nil {
		t.Fatalf("report: %v", err)
	}
	if accepted != 1 {
		t.Fatalf("accepted = %d", accepted)
	}
}
