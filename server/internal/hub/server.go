package hub

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type Server struct {
	store      *Store
	adminToken string
}

func NewServer(store *Store, adminToken string) *Server {
	return &Server{store: store, adminToken: adminToken}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.healthz)
	mux.HandleFunc("GET /api/public/probes/snapshot", s.publicSnapshot)
	mux.HandleFunc("GET /api/public/probes/stream", s.publicStream)
	mux.HandleFunc("GET /api/admin/sources", s.adminSources)
	mux.HandleFunc("POST /api/admin/sources", s.adminSources)
	mux.HandleFunc("GET /api/admin/targets", s.adminTargets)
	mux.HandleFunc("POST /api/admin/targets", s.adminTargets)
	mux.HandleFunc("GET /api/admin/checks", s.adminChecks)
	mux.HandleFunc("POST /api/admin/checks", s.adminChecks)
	return mux
}

func (s *Server) healthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) publicSnapshot(w http.ResponseWriter, r *http.Request) {
	snapshot, err := s.store.Snapshot(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "snapshot unavailable")
		return
	}
	writeJSON(w, http.StatusOK, snapshot)
}

func (s *Server) publicStream(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "streaming unavailable")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()
	for {
		if err := s.writeSnapshotEvent(r.Context(), w); err != nil {
			return
		}
		flusher.Flush()

		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
		}
	}
}

func (s *Server) writeSnapshotEvent(ctx context.Context, w http.ResponseWriter) error {
	snapshot, err := s.store.Snapshot(ctx)
	if err != nil {
		return err
	}
	payload, err := json.Marshal(snapshot)
	if err != nil {
		return err
	}
	_, err = fmt.Fprintf(w, "event: snapshot\ndata: %s\n\n", payload)
	return err
}

func (s *Server) adminSources(w http.ResponseWriter, r *http.Request) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if r.Method == http.MethodGet {
		items, err := s.store.ListSources(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "sources unavailable")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"sources": items})
		return
	}
	var req CreateSourceRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	item, err := s.store.CreateSource(r.Context(), req)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (s *Server) adminTargets(w http.ResponseWriter, r *http.Request) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if r.Method == http.MethodGet {
		items, err := s.store.ListTargets(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "targets unavailable")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"targets": items})
		return
	}
	var req CreateTargetRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	item, err := s.store.CreateTarget(r.Context(), req)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (s *Server) adminChecks(w http.ResponseWriter, r *http.Request) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if r.Method == http.MethodGet {
		items, err := s.store.ListChecks(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "checks unavailable")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"checks": items})
		return
	}
	var req CreateCheckRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	item, err := s.store.CreateCheck(r.Context(), req)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (s *Server) authorized(r *http.Request) bool {
	if s.adminToken == "" {
		return false
	}
	return strings.TrimSpace(r.Header.Get("Authorization")) == "Bearer "+s.adminToken
}

func decodeJSON(r *http.Request, v any) error {
	defer r.Body.Close()
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(v); err != nil {
		return errors.New("invalid JSON body")
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
