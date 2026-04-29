# wiki-probe-agent

`wiki-probe-agent` is an outbound-only probe agent for wiki-kele. It does not listen on any port and only connects to the hub API.

## Network model

- Direction: agent -> hub and agent -> probe targets only.
- Required hub access: outbound TCP 443 to `https://wiki.kele.my/api/agent` or your configured hub URL.
- Probe modes: `tcp`, `icmp`, `http`, and `https` checks are all outbound from the agent host.
- In mainland China deployments, the source machine does not need any inbound firewall opening; it only actively polls and reports to the hub.
- The agent receives private target `kind`/`host`/`port`/`path` only from authenticated `/api/agent/poll`; public APIs must not expose host, port, or path.

## Quick install

Recommended installation is the one-line command shown in Wiki Probe Admin under `源机器（含 Agent）` -> `查看安装命令`. The agent binary is downloaded from the public GitHub Release assets; `wiki.kele.my` does not proxy installers or host binaries.

Example shape:

```bash
curl -fsSL https://github.com/kelenetwork/po0-wiki/releases/latest/download/install.sh | sudo AGENT_ID=src-xxx TOKEN=AGENT_TOKEN HUB_URL=https://wiki.kele.my/api/agent bash
```

After upgrading to `v0.2.0` or newer, rerun `install.sh` on existing source machines so systemd picks up the new binary and optional unit settings. Looking Glass dispatch requires the upgraded agent.

To remove the agent, use the `复制卸载命令` command from the same admin drawer or run:

```bash
curl -fsSL https://github.com/kelenetwork/po0-wiki/releases/latest/download/uninstall.sh | sudo bash
```

Advanced users may override `RELEASE_TAG`, `RELEASE_BASE_URL`, `BIN_PATH`, `CONFIG_PATH`, and `SERVICE_NAME`, or manually download `wiki-probe-agent-linux-amd64`, `wiki-probe-agent-linux-arm64`, or `wiki-probe-agent-linux-armv7` plus the matching `.sha256`.

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
- `http`: performs one outbound plain HTTP `GET` to `http://host:port{path}` with the configured timeout. Empty `path` defaults to `/`. `insecure_skip_verify` does not affect this mode.
- `https`: performs one outbound TLS HTTPS `GET` to `https://host:port{path}` with the configured timeout. Empty `path` defaults to `/`. `insecure_skip_verify` only affects certificate verification for this mode.
- HTTP/HTTPS non-2xx responses are reported as `fail`, and redirects are only followed when they stay on the same host.

## ICMP preparation

ICMP is not enabled by the packaged systemd unit by default. `ping` Looking Glass jobs and `icmp` checks may fail under `DynamicUser` unless ICMP is enabled. Use one of these options if you need ICMP:

```bash
sudo sysctl -w net.ipv4.ping_group_range="0 2147483647"
```

Or install with the optional capability flag:

```bash
curl -fsSL https://github.com/kelenetwork/po0-wiki/releases/latest/download/install.sh | sudo ENABLE_ICMP=true AGENT_ID=src-xxx TOKEN=AGENT_TOKEN HUB_URL=https://wiki.kele.my/api/agent bash
```

This writes these capability lines to the systemd unit; you can also add them manually via an override/unit:

```ini
AmbientCapabilities=CAP_NET_RAW
CapabilityBoundingSet=CAP_NET_RAW
```

## Run

```bash
wiki-probe-agent -config /etc/wiki-probe-agent.json
```

A systemd template is provided at `wiki-probe-agent.service`; the one-line installer writes an equivalent unit automatically.

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
