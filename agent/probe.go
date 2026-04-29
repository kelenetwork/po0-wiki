package main

import (
	"context"
	"fmt"
	"math"
	"net"
	"time"
)

func tcpConnectTiming(ctx context.Context, host string, port int, timeout time.Duration) (float64, error) {
	address := net.JoinHostPort(host, fmt.Sprintf("%d", port))
	dialer := net.Dialer{Timeout: timeout}
	start := time.Now()
	conn, err := dialer.DialContext(ctx, "tcp", address)
	if err != nil {
		return 0, err
	}
	_ = conn.Close()
	return float64(time.Since(start).Microseconds()) / 1000, nil
}

func probeCheck(ctx context.Context, check Check, timeout time.Duration) Result {
	var samples []float64
	failures := 0
	var lastErr error
	for i := 0; i < 3; i++ {
		elapsed, err := tcpConnectTiming(ctx, check.Host, check.Port, timeout)
		if err != nil {
			failures++
			lastErr = err
			continue
		}
		samples = append(samples, elapsed)
	}
	mean, jitter := aggregate(samples)
	loss := float64(failures) / 3 * 100
	status := "ok"
	if failures == 3 {
		status = "fail"
	} else if failures > 0 {
		status = "warn"
	}
	result := Result{CheckID: check.CheckID, TCPConnectMS: mean, Loss: loss, JitterMS: jitter, Status: status, ObservedAt: time.Now().UTC().Format(time.RFC3339)}
	if lastErr != nil {
		result.Error = lastErr.Error()
	}
	return result
}

func aggregate(samples []float64) (float64, float64) {
	if len(samples) == 0 {
		return 0, 0
	}
	var sum float64
	for _, sample := range samples {
		sum += sample
	}
	mean := sum / float64(len(samples))
	var variance float64
	for _, sample := range samples {
		delta := sample - mean
		variance += delta * delta
	}
	return mean, math.Sqrt(variance / float64(len(samples)))
}
