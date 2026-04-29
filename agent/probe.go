package main

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"math"
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	"golang.org/x/net/icmp"
	"golang.org/x/net/ipv4"
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

func probeCheck(ctx context.Context, check Check, timeout time.Duration, insecureSkipVerify bool) Result {
	switch normalizeCheckKind(check.Kind) {
	case "icmp":
		return probeICMP(ctx, check, timeout)
	case "http":
		return probeHTTP(ctx, check, timeout, insecureSkipVerify)
	default:
		return probeTCP(ctx, check, timeout)
	}
}

func probeTCP(ctx context.Context, check Check, timeout time.Duration) Result {
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
	result := baseResult(check, mean, loss, jitter, status)
	if lastErr != nil {
		result.Error = lastErr.Error()
	}
	return result
}

func probeICMP(ctx context.Context, check Check, timeout time.Duration) Result {
	var samples []float64
	failures := 0
	var lastErr error
	for i := 0; i < 3; i++ {
		elapsed, err := icmpEchoTiming(ctx, check.Host, i+1, timeout)
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
	result := baseResult(check, mean, loss, jitter, status)
	if lastErr != nil {
		if errors.Is(lastErr, errICMPUnsupported) {
			result.Error = "icmp unsupported"
		} else {
			result.Error = lastErr.Error()
		}
	}
	return result
}

var errICMPUnsupported = errors.New("icmp unsupported")

func icmpEchoTiming(ctx context.Context, host string, seq int, timeout time.Duration) (float64, error) {
	ips, err := net.DefaultResolver.LookupIP(ctx, "ip4", host)
	if err != nil {
		return 0, err
	}
	if len(ips) == 0 {
		return 0, fmt.Errorf("no IPv4 address for %s", host)
	}
	conn, err := net.ListenPacket("udp4", "")
	if err != nil {
		return 0, errICMPUnsupported
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(timeout))

	body := &icmp.Echo{ID: os.Getpid() & 0xffff, Seq: seq, Data: []byte("wiki-kele")}
	message := icmp.Message{Type: ipv4.ICMPTypeEcho, Code: 0, Body: body}
	payload, err := message.Marshal(nil)
	if err != nil {
		return 0, err
	}
	start := time.Now()
	if _, err := conn.WriteTo(payload, &net.UDPAddr{IP: ips[0]}); err != nil {
		return 0, err
	}
	buffer := make([]byte, 1500)
	for {
		if err := ctx.Err(); err != nil {
			return 0, err
		}
		n, peer, err := conn.ReadFrom(buffer)
		if err != nil {
			return 0, err
		}
		if !samePeerIP(peer, ips[0]) {
			continue
		}
		reply, err := icmp.ParseMessage(1, buffer[:n])
		if err != nil {
			continue
		}
		echo, ok := reply.Body.(*icmp.Echo)
		if reply.Type == ipv4.ICMPTypeEchoReply && ok && echo.Seq == seq {
			return float64(time.Since(start).Microseconds()) / 1000, nil
		}
	}
}

func samePeerIP(peer net.Addr, ip net.IP) bool {
	switch addr := peer.(type) {
	case *net.UDPAddr:
		return addr.IP.Equal(ip)
	case *net.IPAddr:
		return addr.IP.Equal(ip)
	default:
		return strings.Contains(peer.String(), ip.String())
	}
}

func probeHTTP(ctx context.Context, check Check, timeout time.Duration, insecureSkipVerify bool) Result {
	url := httpProbeURL(check)
	transport := http.DefaultTransport.(*http.Transport).Clone()
	if insecureSkipVerify {
		transport.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}
	}
	client := &http.Client{Timeout: timeout, Transport: transport}
	originalHost := check.Host
	client.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		if req.URL.Hostname() != originalHost {
			return http.ErrUseLastResponse
		}
		return nil
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		result := baseResult(check, 0, 100, 0, "fail")
		result.Error = err.Error()
		return result
	}
	start := time.Now()
	resp, err := client.Do(req)
	elapsed := float64(time.Since(start).Microseconds()) / 1000
	if err != nil {
		result := baseResult(check, elapsed, 100, 0, "fail")
		result.Error = err.Error()
		return result
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1<<20))
	status := "ok"
	loss := 0.0
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		status = "fail"
		loss = 100
	}
	result := baseResult(check, elapsed, loss, 0, status)
	result.Code = resp.StatusCode
	if status == "fail" {
		result.Error = fmt.Sprintf("http status %d", resp.StatusCode)
	}
	return result
}

func httpProbeURL(check Check) string {
	scheme := "https"
	if check.Port == 80 {
		scheme = "http"
	}
	path := strings.TrimSpace(check.Path)
	if path == "" {
		path = "/"
	}
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	return fmt.Sprintf("%s://%s%s", scheme, net.JoinHostPort(check.Host, fmt.Sprintf("%d", check.Port)), path)
}

func baseResult(check Check, latency, loss, jitter float64, status string) Result {
	return Result{CheckID: check.CheckID, Kind: normalizeCheckKind(check.Kind), TCPConnectMS: latency, Loss: loss, JitterMS: jitter, Status: status, ObservedAt: time.Now().UTC().Format(time.RFC3339)}
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

func normalizeCheckKind(kind string) string {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "icmp":
		return "icmp"
	case "http":
		return "http"
	default:
		return "tcp"
	}
}
