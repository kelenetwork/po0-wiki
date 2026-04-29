package main

type Config struct {
	AgentID               string `json:"agent_id"`
	HubURL                string `json:"hub_url"`
	Token                 string `json:"token"`
	PollIntervalSeconds   int    `json:"poll_interval_seconds"`
	ReportIntervalSeconds int    `json:"report_interval_seconds"`
	TCPTimeoutMS          int    `json:"tcp_timeout_ms"`
	InsecureSkipVerify    bool   `json:"insecure_skip_verify"`
}

type Check struct {
	CheckID         string `json:"check_id"`
	DisplayName     string `json:"display_name"`
	Host            string `json:"host"`
	Port            int    `json:"port"`
	Kind            string `json:"kind"`
	Path            string `json:"path"`
	IntervalSeconds int    `json:"interval_seconds"`
}

type Result struct {
	CheckID      string  `json:"check_id"`
	Kind         string  `json:"kind,omitempty"`
	TCPConnectMS float64 `json:"tcp_connect_ms"`
	Loss         float64 `json:"loss"`
	JitterMS     float64 `json:"jitter_ms"`
	Status       string  `json:"status"`
	ObservedAt   string  `json:"observed_at"`
	Code         int     `json:"code,omitempty"`
	Error        string  `json:"error,omitempty"`
}

type LGJob struct {
	ID         string `json:"id"`
	AgentID    string `json:"agent_id"`
	Tool       string `json:"tool"`
	TargetID   string `json:"target_id"`
	TargetHost string `json:"target_host"`
	TargetPort int    `json:"target_port"`
	Status     string `json:"status"`
}
