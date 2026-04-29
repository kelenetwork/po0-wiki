package hub

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"
)

const defaultReleaseBaseURL = "https://github.com/kelenetwork/po0-wiki/releases/latest/download"

type Server struct {
	store          *Store
	adminToken     string
	agentHubURL    string
	releaseBaseURL string
}

func NewServer(store *Store, adminToken string) *Server {
	releaseBaseURL := strings.TrimRight(strings.TrimSpace(os.Getenv("WIKI_RELEASE_BASE_URL")), "/")
	if releaseBaseURL == "" {
		releaseBaseURL = defaultReleaseBaseURL
	}
	return &Server{store: store, adminToken: adminToken, agentHubURL: "https://wiki.kele.my/api/agent", releaseBaseURL: releaseBaseURL}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.healthz)
	mux.HandleFunc("GET /api/healthz", s.healthz)
	mux.HandleFunc("GET /api/public/probes/snapshot", s.publicSnapshot)
	mux.HandleFunc("GET /api/public/probes/stream", s.publicStream)
	mux.HandleFunc("POST /api/public/lg/run", s.publicLGRun)
	mux.HandleFunc("GET /api/public/lg/result", s.publicLGResult)
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
	mux.HandleFunc("POST /api/agent/lg/poll", s.agentLGPoll)
	mux.HandleFunc("POST /api/agent/lg/report", s.agentLGReport)
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

type lgRunRequest struct {
	Tool     string `json:"tool"`
	SourceID string `json:"source_id"`
	TargetID string `json:"target_id"`
}

func (s *Server) publicLGRun(w http.ResponseWriter, r *http.Request) {
	var req lgRunRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	req.Tool = strings.ToLower(strings.TrimSpace(req.Tool))
	if !validLGTool(req.Tool) {
		writeError(w, http.StatusBadRequest, "unsupported tool")
		return
	}
	source, target, err := s.store.LookingGlassEndpoint(r.Context(), req.SourceID, req.TargetID)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	if isHubSource(req.SourceID) {
		ctx, cancel := context.WithTimeout(r.Context(), 18*time.Second)
		defer cancel()
		output := runLocalLookingGlass(ctx, req.Tool, source, target)
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(output))
		return
	}

	job, err := s.store.CreateLGJob(r.Context(), source.ID, req.Tool, target.ID, target.Host, target.Port)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "job unavailable")
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]string{"job_id": job.ID, "status": job.Status})
}

func (s *Server) publicLGResult(w http.ResponseWriter, r *http.Request) {
	result, err := s.store.LGJobResult(r.Context(), r.URL.Query().Get("job_id"))
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func isHubSource(sourceID string) bool {
	switch strings.ToLower(strings.TrimSpace(sourceID)) {
	case "", "hub", "wiki-hub", "hub-local":
		return true
	default:
		return false
	}
}

func validLGTool(tool string) bool {
	switch tool {
	case "ping", "tcping", "mtr", "nexttrace", "traceroute":
		return true
	default:
		return false
	}
}

func runLocalLookingGlass(ctx context.Context, tool string, source Source, target AdminTarget) string {
	var builder strings.Builder
	fmt.Fprintf(&builder, "⚠ 测试发起点：Hub (上海) — Hub-local fallback。\n")
	fmt.Fprintf(&builder, "   这是 wiki.kele.my 服务器本机执行，不是 agent dispatch。\n")
	fmt.Fprintf(&builder, "# Looking Glass Run\n")
	fmt.Fprintf(&builder, "# Requested source: %s (%s)\n", source.DisplayName, source.ID)
	fmt.Fprintf(&builder, "# Execution mode: Hub-local fallback (not agent dispatch)\n")
	fmt.Fprintf(&builder, "# Target: %s [endpoint hidden, port %d]\n\n", target.DisplayName, target.Port)

	switch tool {
	case "tcping":
		builder.WriteString(runTCPing(ctx, target.Host, target.Port, target.DisplayName))
	case "ping":
		builder.WriteString(runCommandOrMessage(ctx, "ping", []string{"-c", "4", "-W", "2", target.Host}, target.Host, target.DisplayName, func() string {
			return "ping command is unavailable in hub container; fallback to tcping.\n" + runTCPing(ctx, target.Host, target.Port, target.DisplayName)
		}))
	case "traceroute":
		builder.WriteString(runCommandOrMessage(ctx, "traceroute", []string{"-m", "20", target.Host}, target.Host, target.DisplayName, func() string {
			return "traceroute command is unavailable in hub container; fallback to tcping.\n" + runTCPing(ctx, target.Host, target.Port, target.DisplayName)
		}))
	case "mtr":
		builder.WriteString(runCommandOrMessage(ctx, "mtr", []string{"--report", "--report-cycles", "4", target.Host}, target.Host, target.DisplayName, func() string {
			return "mtr command is unavailable in hub container; fallback to tcping.\n" + runTCPing(ctx, target.Host, target.Port, target.DisplayName)
		}))
	case "nexttrace":
		builder.WriteString(runCommandOrMessage(ctx, "nexttrace", []string{"-q", "1", target.Host}, target.Host, target.DisplayName, func() string {
			return "nexttrace command is unavailable in hub container; fallback to tcping.\n" + runTCPing(ctx, target.Host, target.Port, target.DisplayName)
		}))
	}
	return builder.String()
}

func runCommandOrMessage(ctx context.Context, name string, args []string, hiddenHost string, displayName string, fallback func() string) string {
	if _, err := exec.LookPath(name); err != nil {
		return fallback()
	}
	cmd := exec.CommandContext(ctx, name, args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return sanitizeLGOutput(fmt.Sprintf("$ %s %s\n%s\nerror: %v\n", name, strings.Join(args, " "), strings.TrimSpace(string(output)), err), hiddenHost, displayName)
	}
	return sanitizeLGOutput(fmt.Sprintf("$ %s %s\n%s\n", name, strings.Join(args, " "), strings.TrimSpace(string(output))), hiddenHost, displayName)
}

func sanitizeLGOutput(value string, hiddenHost string, displayName string) string {
	if hiddenHost == "" {
		return value
	}
	replacement := displayName
	if replacement == "" {
		replacement = "target"
	}
	return strings.ReplaceAll(value, hiddenHost, replacement)
}

func runTCPing(ctx context.Context, host string, port int, displayName string) string {
	if port <= 0 {
		port = 443
	}
	address := net.JoinHostPort(host, fmt.Sprintf("%d", port))
	var builder strings.Builder
	fmt.Fprintf(&builder, "$ tcping %s:%d\n", displayName, port)
	dialer := net.Dialer{Timeout: 3 * time.Second}
	var successes int
	var total time.Duration
	for index := 1; index <= 4; index++ {
		started := time.Now()
		conn, err := dialer.DialContext(ctx, "tcp", address)
		elapsed := time.Since(started)
		if err != nil {
			fmt.Fprintf(&builder, "%d  timeout/error  %s\n", index, sanitizeLGOutput(err.Error(), host, displayName))
			continue
		}
		successes++
		total += elapsed
		_ = conn.Close()
		fmt.Fprintf(&builder, "%d  connected  %.2f ms\n", index, float64(elapsed.Microseconds())/1000)
	}
	loss := 100 - successes*25
	avg := 0.0
	if successes > 0 {
		avg = float64(total.Microseconds()) / 1000 / float64(successes)
	}
	fmt.Fprintf(&builder, "\nsummary: sent=4 received=%d loss=%d%% avg=%.2f ms\n", successes, loss, avg)
	return builder.String()
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
	prepared, _ := prepareTarget(req)
	item := AdminTarget{ID: created.ID, DisplayName: created.DisplayName, Region: created.Region, Tags: created.Tags, Status: created.Status, Kind: prepared.Kind, Host: prepared.Host, Port: prepared.Port, Path: prepared.Path, UpdatedAt: created.UpdatedAt}
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
	install, err := s.store.AgentInstall(r.Context(), r.PathValue("id"), s.agentHubURL, s.releaseBaseURL)
	if err != nil {
		if strings.Contains(err.Error(), "重置 Token") {
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

func (s *Server) agentLGPoll(w http.ResponseWriter, r *http.Request) {
	agentID, ok := s.authorizedAgent(w, r)
	if !ok {
		return
	}
	var req struct {
		AgentID string `json:"agent_id"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.AgentID != agentID {
		writeError(w, http.StatusForbidden, "agent_id does not match token")
		return
	}
	job, ok, err := s.store.ClaimLGJob(r.Context(), agentID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "job unavailable")
		return
	}
	if !ok {
		writeJSON(w, http.StatusOK, map[string]any{"job": nil})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"job": job})
}

func (s *Server) agentLGReport(w http.ResponseWriter, r *http.Request) {
	agentID, ok := s.authorizedAgent(w, r)
	if !ok {
		return
	}
	var req struct {
		AgentID string `json:"agent_id"`
		JobID   string `json:"job_id"`
		Output  string `json:"output"`
		Error   string `json:"error"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.AgentID != agentID {
		writeError(w, http.StatusForbidden, "agent_id does not match token")
		return
	}
	if err := s.store.CompleteLGJob(r.Context(), agentID, req.JobID, req.Output, req.Error); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
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
