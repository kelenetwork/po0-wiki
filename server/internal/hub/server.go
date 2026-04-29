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
	mux.HandleFunc("GET /api/healthz", s.healthz)
	mux.HandleFunc("GET /api/public/probes/snapshot", s.publicSnapshot)
	mux.HandleFunc("GET /api/public/probes/stream", s.publicStream)
	mux.HandleFunc("GET /api/admin/sources", s.adminSources)
	mux.HandleFunc("POST /api/admin/sources", s.adminSources)
	mux.HandleFunc("PUT /api/admin/sources/{id}", s.adminSource)
	mux.HandleFunc("DELETE /api/admin/sources/{id}", s.adminSource)
	mux.HandleFunc("GET /api/admin/targets", s.adminTargets)
	mux.HandleFunc("POST /api/admin/targets", s.adminTargets)
	mux.HandleFunc("PUT /api/admin/targets/{id}", s.adminTarget)
	mux.HandleFunc("DELETE /api/admin/targets/{id}", s.adminTarget)
	mux.HandleFunc("GET /api/admin/checks", s.adminChecks)
	mux.HandleFunc("POST /api/admin/checks", s.adminChecks)
	mux.HandleFunc("PUT /api/admin/checks/{id}", s.adminCheck)
	mux.HandleFunc("DELETE /api/admin/checks/{id}", s.adminCheck)
	mux.HandleFunc("GET /api/admin/agents", s.adminAgents)
	mux.HandleFunc("POST /api/admin/agents", s.adminAgents)
	mux.HandleFunc("DELETE /api/admin/agents/{id}", s.adminAgent)
	mux.HandleFunc("POST /api/admin/agents/{id}/reset-token", s.adminAgentResetToken)
	mux.HandleFunc("GET /api/admin/agents/{id}/install", s.adminAgentInstall)
	mux.HandleFunc("POST /api/agent/poll", s.agentPoll)
	mux.HandleFunc("POST /api/agent/report", s.agentReport)
	return mux
}

func (s *Server) adminSource(w http.ResponseWriter, r *http.Request) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if r.Method == http.MethodDelete {
		if err := s.store.DeleteSource(r.Context(), r.PathValue("id")); err != nil {
			if errors.Is(err, errRelatedChecks) {
				writeError(w, http.StatusConflict, err.Error())
				return
			}
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"deleted": true})
		return
	}
	var req UpdateSourceRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	item, err := s.store.UpdateSource(r.Context(), r.PathValue("id"), req)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, item)
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
		items, err := s.store.ListAdminTargets(r.Context())
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
	created, err := s.store.CreateTarget(r.Context(), req)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	endpoint, _ := targetEndpoint(req)
	host, port, _ := splitEndpoint(endpoint)
	item := AdminTarget{ID: created.ID, DisplayName: created.DisplayName, Region: created.Region, Tags: created.Tags, Status: created.Status, Host: host, Port: port, UpdatedAt: created.UpdatedAt}
	writeJSON(w, http.StatusCreated, item)
}

func (s *Server) adminTarget(w http.ResponseWriter, r *http.Request) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if r.Method == http.MethodDelete {
		if err := s.store.DeleteTarget(r.Context(), r.PathValue("id")); err != nil {
			if errors.Is(err, errRelatedChecks) {
				writeError(w, http.StatusConflict, err.Error())
				return
			}
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"deleted": true})
		return
	}
	var req CreateTargetRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	item, err := s.store.UpdateTarget(r.Context(), r.PathValue("id"), req)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) adminChecks(w http.ResponseWriter, r *http.Request) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if r.Method == http.MethodGet {
		items, err := s.store.ListAdminChecks(r.Context())
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

func (s *Server) adminCheck(w http.ResponseWriter, r *http.Request) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if r.Method == http.MethodDelete {
		if err := s.store.DeleteCheck(r.Context(), r.PathValue("id")); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"deleted": true})
		return
	}
	var req CreateCheckRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	item, err := s.store.UpdateCheck(r.Context(), r.PathValue("id"), req)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) adminAgents(w http.ResponseWriter, r *http.Request) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if r.Method == http.MethodGet {
		agents, err := s.store.ListAgents(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "agents unavailable")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"agents": agents})
		return
	}
	var req CreateAgentRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	created, err := s.store.CreateAgent(r.Context(), req)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (s *Server) adminAgent(w http.ResponseWriter, r *http.Request) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if err := s.store.DeleteAgent(r.Context(), r.PathValue("id")); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"deleted": true})
}

func (s *Server) adminAgentResetToken(w http.ResponseWriter, r *http.Request) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	created, err := s.store.ResetAgentToken(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, created)
}

func (s *Server) adminAgentInstall(w http.ResponseWriter, r *http.Request) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	install, err := s.store.ConsumeAgentInstall(r.Context(), r.PathValue("id"), "https://wiki.kele.my/api/agent")
	if err != nil {
		if strings.Contains(err.Error(), "reset token") {
			writeError(w, http.StatusConflict, err.Error())
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, install)
}

func (s *Server) agentPoll(w http.ResponseWriter, r *http.Request) {
	agentID, ok := s.authorizedAgent(w, r)
	if !ok {
		return
	}
	var req struct {
		AgentID  string `json:"agent_id"`
		Version  string `json:"version"`
		Hostname string `json:"hostname"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.AgentID != agentID {
		writeError(w, http.StatusForbidden, "agent_id does not match token")
		return
	}
	checks, err := s.store.AgentChecks(r.Context(), agentID, req.Version, req.Hostname)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "checks unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"checks": checks})
}

func (s *Server) agentReport(w http.ResponseWriter, r *http.Request) {
	agentID, ok := s.authorizedAgent(w, r)
	if !ok {
		return
	}
	var req struct {
		AgentID string        `json:"agent_id"`
		Results []AgentResult `json:"results"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.AgentID != agentID {
		writeError(w, http.StatusForbidden, "agent_id does not match token")
		return
	}
	accepted, err := s.store.RecordAgentResults(r.Context(), agentID, req.Results)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "results unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"accepted": accepted})
}

func (s *Server) authorized(r *http.Request) bool {
	if s.adminToken == "" {
		return false
	}
	return strings.TrimSpace(r.Header.Get("Authorization")) == "Bearer "+s.adminToken
}

func (s *Server) authorizedAgent(w http.ResponseWriter, r *http.Request) (string, bool) {
	const prefix = "Bearer "
	header := strings.TrimSpace(r.Header.Get("Authorization"))
	if !strings.HasPrefix(header, prefix) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return "", false
	}
	agentID, err := s.store.AgentIDForToken(r.Context(), strings.TrimSpace(strings.TrimPrefix(header, prefix)))
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return "", false
	}
	return agentID, true
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
