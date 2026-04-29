# wiki-probe-agent

`wiki-probe-agent` is an outbound-only TCP probe agent for wiki-kele. It does not listen on any port and only connects to the hub API.

## Network model

- Direction: agent -> hub only.
- Required access: outbound TCP 443 to `https://wiki.kele.my/api/agent` or your configured hub URL.
- In mainland China deployments, the source machine does not need any inbound firewall opening; it only actively polls and reports to the hub.
- The agent receives private target `host`/`port` only from authenticated `/api/agent/poll`; public APIs must not expose those fields.

## Config

Default path: `/etc/wiki-probe-agent.json`. Override with `-config`.

```json
{
  "agent_id": "src-xxx",
  "hub_url": "https://wiki.kele.my/api/agent",
  "token": "AGENT_TOKEN",
  "poll_interval_seconds": 30,
  "report_interval_seconds": 30,
  "tcp_timeout_ms": 3000,
  "insecure_skip_verify": false
}
```

## Run

```bash
wiki-probe-agent -config /etc/wiki-probe-agent.json
```

A systemd template is provided at `wiki-probe-agent.service`; it is not installed automatically.

## Debug

```bash
journalctl -u wiki-probe-agent -f
```

The logs include poll/report failures, JSON decode errors, HTTP non-2xx responses, and TCP timeout errors without exposing any inbound service.
