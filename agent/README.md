# wiki-probe-agent

`wiki-probe-agent` is an outbound-only probe agent for wiki-kele. It does not listen on any port and only connects to the hub API.

## Network model

- Direction: agent -> hub and agent -> probe targets only.
- Required hub access: outbound TCP 443 to `https://wiki.kele.my/api/agent` or your configured hub URL.
- Probe modes: `tcp`, `icmp`, and `http` checks are all outbound from the agent host.
- In mainland China deployments, the source machine does not need any inbound firewall opening; it only actively polls and reports to the hub.
- The agent receives private target `kind`/`host`/`port`/`path` only from authenticated `/api/agent/poll`; public APIs must not expose host, port, or path.

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

Existing config files remain compatible. `insecure_skip_verify` is optional and only affects HTTPS hub/report traffic and HTTPS probe checks.

## Probe modes

- `tcp`: performs three TCP connect attempts and reports average `tcp_connect_ms`, loss, and jitter.
- `icmp`: performs three IPv4 ICMP echo attempts using unprivileged datagram ICMP. IPv6 is not supported yet.
- `http`: performs one outbound `GET` with the configured timeout. Port `80` uses `http://`; all other ports use `https://`. Empty `path` defaults to `/`. Non-2xx responses are reported as `fail`, and redirects are only followed when they stay on the same host.

## ICMP preparation

ICMP is not enabled by the packaged systemd unit by default. Use one of these options if you need `icmp` checks:

```bash
sudo sysctl -w net.ipv4.ping_group_range="0 2147483647"
```

Or add capabilities to the systemd service override/unit:

```ini
AmbientCapabilities=CAP_NET_RAW
CapabilityBoundingSet=CAP_NET_RAW
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

The logs include poll/report failures, JSON decode errors, HTTP non-2xx responses, and probe timeout errors without exposing any inbound service.

## Uninstall

```bash
sudo systemctl disable --now wiki-probe-agent || true
sudo rm -f /etc/systemd/system/wiki-probe-agent.service
sudo rm -f /usr/local/bin/wiki-probe-agent
sudo rm -f /etc/wiki-probe-agent.json
sudo systemctl daemon-reload
```
