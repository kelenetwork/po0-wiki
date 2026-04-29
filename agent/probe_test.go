package main

import (
	"context"
	"fmt"
	"math"
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"
)

func TestTCPConnectTiming(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer listener.Close()
	go func() {
		for {
			conn, err := listener.Accept()
			if err != nil {
				return
			}
			_ = conn.Close()
		}
	}()
	host, portText, err := net.SplitHostPort(listener.Addr().String())
	if err != nil {
		t.Fatalf("split addr: %v", err)
	}
	var port int
	if _, err := fmt.Sscanf(portText, "%d", &port); err != nil {
		t.Fatalf("parse port: %v", err)
	}
	elapsed, err := tcpConnectTiming(context.Background(), host, port, time.Second)
	if err != nil {
		t.Fatalf("tcp timing: %v", err)
	}
	if elapsed < 0 {
		t.Fatalf("elapsed must be non-negative: %f", elapsed)
	}
}

func TestAggregate(t *testing.T) {
	mean, jitter := aggregate([]float64{10, 20, 30})
	if mean != 20 {
		t.Fatalf("mean = %f", mean)
	}
	wantJitter := math.Sqrt(200.0 / 3.0)
	if math.Abs(jitter-wantJitter) > 0.0001 {
		t.Fatalf("jitter = %f want %f", jitter, wantJitter)
	}
	result := probeCheck(context.Background(), Check{CheckID: "closed", Host: "127.0.0.1", Port: 1, Kind: "tcp"}, 10*time.Millisecond, false)
	if result.Status != "fail" || result.Loss != 100 {
		t.Fatalf("result = %+v", result)
	}
}

func TestHTTPProbeStatusAndLatency(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/fail" {
			http.Error(w, "boom", http.StatusInternalServerError)
			return
		}
		_, _ = w.Write([]byte("ok"))
	}))
	defer server.Close()
	host, port := splitTestServerAddr(t, server.Listener.Addr().String())

	ok := probeCheck(context.Background(), Check{CheckID: "http-ok", Kind: "http", Host: host, Port: port, Path: "/ok"}, time.Second, true)
	if ok.Status != "ok" || ok.Code != http.StatusOK || ok.TCPConnectMS <= 0 || ok.Kind != "http" {
		t.Fatalf("ok result = %+v", ok)
	}

	fail := probeCheck(context.Background(), Check{CheckID: "http-fail", Kind: "http", Host: host, Port: port, Path: "/fail"}, time.Second, true)
	if fail.Status != "fail" || fail.Code != http.StatusInternalServerError || fail.TCPConnectMS <= 0 || fail.Error == "" {
		t.Fatalf("fail result = %+v", fail)
	}
}

func TestICMPProbeLocalhostStub(t *testing.T) {
	result := probeCheck(context.Background(), Check{CheckID: "icmp-local", Kind: "icmp", Host: "127.0.0.1"}, 200*time.Millisecond, false)
	if result.Status == "fail" && result.Error != "" {
		t.Skipf("icmp unavailable in this environment: %s", result.Error)
	}
	if result.Kind != "icmp" {
		t.Fatalf("icmp kind = %q", result.Kind)
	}
}

func splitTestServerAddr(t *testing.T, addr string) (string, int) {
	t.Helper()
	host, portText, err := net.SplitHostPort(addr)
	if err != nil {
		t.Fatalf("split addr: %v", err)
	}
	port, err := strconv.Atoi(portText)
	if err != nil {
		t.Fatalf("parse port: %v", err)
	}
	return host, port
}
