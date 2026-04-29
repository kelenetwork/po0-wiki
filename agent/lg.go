package main

import (
	"context"
	"errors"
	"fmt"
	"net"
	"os"
	"os/exec"
	"strings"
	"time"
)

const maxLGOutputBytes = 16 * 1024

func runLGJob(parent context.Context, job LGJob) (string, string) {
	ctx, cancel := context.WithTimeout(parent, 20*time.Second)
	defer cancel()

	var output string
	var err error
	switch job.Tool {
	case "ping":
		output, err = runLGCommand(ctx, "ping", []string{"-c", "4", "-W", "2", job.TargetHost})
	case "mtr":
		output, err = runLGCommand(ctx, "mtr", []string{"--report", "--report-cycles", "4", job.TargetHost})
	case "traceroute":
		output, err = runLGCommand(ctx, "traceroute", []string{"-m", "20", job.TargetHost})
	case "nexttrace":
		output, err = runLGCommand(ctx, "nexttrace", []string{"-q", "1", job.TargetHost})
	case "tcping":
		output, err = runLGTCPing(ctx, job.TargetHost, job.TargetPort)
	default:
		return "", "unsupported lg tool: " + job.Tool
	}
	if ctx.Err() == context.DeadlineExceeded {
		return truncateLGOutput(output), "lg job timed out after 20s"
	}
	if err != nil {
		return truncateLGOutput(output), err.Error()
	}
	return truncateLGOutput(output), ""
}

func runLGCommand(ctx context.Context, name string, args []string) (string, error) {
	if _, err := exec.LookPath(name); err != nil {
		return "", fmt.Errorf("agent host missing tool: %s (PATH=%s, LookPath=%v)", name, os.Getenv("PATH"), err)
	}
	cmd := exec.CommandContext(ctx, name, args...)
	data, err := cmd.CombinedOutput()
	output := fmt.Sprintf("$ %s %s\n%s\n", name, strings.Join(args, " "), strings.TrimSpace(string(data)))
	if err != nil {
		return output, err
	}
	return output, nil
}

func runLGTCPing(ctx context.Context, host string, port int) (string, error) {
	if port <= 0 {
		port = 443
	}
	address := net.JoinHostPort(host, fmt.Sprintf("%d", port))
	var builder strings.Builder
	fmt.Fprintf(&builder, "$ tcping %s:%d\n", host, port)
	dialer := net.Dialer{Timeout: 3 * time.Second}
	var successes int
	var total time.Duration
	for index := 1; index <= 4; index++ {
		started := time.Now()
		conn, err := dialer.DialContext(ctx, "tcp", address)
		elapsed := time.Since(started)
		if err != nil {
			fmt.Fprintf(&builder, "%d  timeout/error  %s\n", index, err.Error())
			continue
		}
		successes++
		total += elapsed
		_ = conn.Close()
		fmt.Fprintf(&builder, "%d  connected  %.2f ms\n", index, float64(elapsed.Microseconds())/1000)
	}
	if ctx.Err() != nil {
		return builder.String(), ctx.Err()
	}
	if successes == 0 {
		return builder.String(), errors.New("tcping failed: 4/4 attempts failed")
	}
	avg := float64(total.Microseconds()) / 1000 / float64(successes)
	loss := 100 - successes*25
	fmt.Fprintf(&builder, "\nsummary: sent=4 received=%d loss=%d%% avg=%.2f ms\n", successes, loss, avg)
	return builder.String(), nil
}

func truncateLGOutput(value string) string {
	data := []byte(value)
	if len(data) <= maxLGOutputBytes {
		return value
	}
	return string(data[:maxLGOutputBytes]) + "\n... output truncated to 16KB ...\n"
}
