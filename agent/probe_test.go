package main

import (
	"context"
	"fmt"
	"math"
	"net"
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
	result := probeCheck(context.Background(), Check{CheckID: "closed", Host: "127.0.0.1", Port: 1}, 10*time.Millisecond)
	if result.Status != "fail" || result.Loss != 100 {
		t.Fatalf("result = %+v", result)
	}
}
