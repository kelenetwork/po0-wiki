package main

import (
	"encoding/json"
	"log"
	"net"
	"net/http"
	"time"
)

// startProbeListener starts an optional HTTPS endpoint used by the wiki's
// visitor-side latency test. Browsers measure HTTPS round-trip time against
// this endpoint, so the handler must be as cheap as possible: no body, no
// allocation-heavy work, just headers + 204.
//
// CORS: the wiki origin fetches this endpoint cross-origin.
// Timing-Allow-Origin lets the browser expose detailed resource timing.
func startProbeListener(cfg Config) {
	if cfg.ProbeListen == "" {
		return
	}
	if cfg.ProbeCertFile == "" || cfg.ProbeKeyFile == "" {
		log.Printf("probe listener disabled: probe_cert_file/probe_key_file not set")
		return
	}

	setCommonHeaders := func(w http.ResponseWriter) {
		h := w.Header()
		h.Set("Access-Control-Allow-Origin", "*")
		h.Set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
		h.Set("Access-Control-Max-Age", "86400")
		h.Set("Timing-Allow-Origin", "*")
		h.Set("Cache-Control", "no-store")
	}

	mux := http.NewServeMux()
	handler := func(w http.ResponseWriter, r *http.Request) {
		setCommonHeaders(w)
		w.WriteHeader(http.StatusNoContent)
	}
	// /ip echoes the client IP as seen by this entry node, so visitors can
	// confirm the measurement really went direct (not through a proxy).
	mux.HandleFunc("/ip", func(w http.ResponseWriter, r *http.Request) {
		setCommonHeaders(w)
		host, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil {
			host = r.RemoteAddr
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"ip": host})
	})
	mux.HandleFunc("/probe", handler)
	mux.HandleFunc("/", handler)

	server := &http.Server{
		Addr:              cfg.ProbeListen,
		Handler:           mux,
		ReadTimeout:       10 * time.Second,
		ReadHeaderTimeout: 10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       65 * time.Second,
		MaxHeaderBytes:    8 << 10,
	}

	go func() {
		log.Printf("probe listener on %s", cfg.ProbeListen)
		if err := server.ListenAndServeTLS(cfg.ProbeCertFile, cfg.ProbeKeyFile); err != nil && err != http.ErrServerClosed {
			log.Printf("probe listener failed: %v", err)
		}
	}()
}
