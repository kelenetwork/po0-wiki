#!/usr/bin/env bash
set -euo pipefail

log() { printf '[wiki-probe-agent] %s\n' "$*" >&2; }
fail() { log "ERROR: $*"; exit 1; }
require_env() {
  local name value
  name="$1"
  value="${!name:-}"
  [ -n "$value" ] || fail "$name is required"
}

require_env AGENT_ID
require_env TOKEN

HUB_URL="${HUB_URL:-https://wiki.kele.my/api/agent}"
RELEASE_TAG="${RELEASE_TAG:-latest}"
BIN_PATH="${BIN_PATH:-/usr/local/bin/wiki-probe-agent}"
CONFIG_PATH="${CONFIG_PATH:-/etc/wiki-probe-agent.json}"
SERVICE_NAME="${SERVICE_NAME:-wiki-probe-agent.service}"
ENABLE_ICMP="${ENABLE_ICMP:-false}"
UNIT_PATH="/etc/systemd/system/${SERVICE_NAME}"
RELEASE_BASE_URL="${RELEASE_BASE_URL:-https://github.com/kelenetwork/po0-wiki/releases/${RELEASE_TAG}/download}"

case "$(uname -m)" in
  x86_64|amd64) arch="amd64" ;;
  aarch64|arm64) arch="arm64" ;;
  armv7l|armv7) arch="armv7" ;;
  *) fail "unsupported architecture: $(uname -m)" ;;
esac

command -v curl >/dev/null 2>&1 || fail "curl is required"
command -v sha256sum >/dev/null 2>&1 || fail "sha256sum is required"
command -v systemctl >/dev/null 2>&1 || fail "systemctl is required"
command -v install >/dev/null 2>&1 || fail "install is required"

asset="wiki-probe-agent-linux-${arch}"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
bin_tmp="${tmp_dir}/${asset}"
sha_tmp="${tmp_dir}/${asset}.sha256"

log "downloading ${asset} from ${RELEASE_BASE_URL}"
curl -fsSL "${RELEASE_BASE_URL}/${asset}" -o "$bin_tmp"
curl -fsSL "${RELEASE_BASE_URL}/${asset}.sha256" -o "$sha_tmp"
(
  cd "$tmp_dir"
  sha256sum -c "${asset}.sha256"
)

log "installing binary to ${BIN_PATH}"
install -m 0755 "$bin_tmp" "$BIN_PATH"

log "writing config to ${CONFIG_PATH}"
umask 077
cat > "$CONFIG_PATH" <<JSON
{
  "agent_id": "${AGENT_ID}",
  "hub_url": "${HUB_URL}",
  "token": "${TOKEN}",
  "poll_interval_seconds": 30,
  "report_interval_seconds": 30,
  "tcp_timeout_ms": 3000,
  "insecure_skip_verify": false
}
JSON
# 0644 so systemd DynamicUser can read it; root-owned, ReadOnlyPaths-protected.
chmod 0644 "$CONFIG_PATH"

icmp_capability_lines=""
case "$ENABLE_ICMP" in
  true|TRUE|1|yes|YES)
    icmp_capability_lines=$'AmbientCapabilities=CAP_NET_RAW\nCapabilityBoundingSet=CAP_NET_RAW'
    ;;
esac

log "writing systemd unit to ${UNIT_PATH}"
cat > "$UNIT_PATH" <<UNIT
[Unit]
Description=Wiki Kele outbound probe agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${BIN_PATH} -config ${CONFIG_PATH}
Restart=always
RestartSec=5s
DynamicUser=yes
# Set ENABLE_ICMP=true when installing to allow ICMP ping under DynamicUser.
${icmp_capability_lines}
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadOnlyPaths=${CONFIG_PATH}

[Install]
WantedBy=multi-user.target
UNIT
chmod 0644 "$UNIT_PATH"

log "starting ${SERVICE_NAME}"
systemctl daemon-reload
systemctl enable "$SERVICE_NAME" >/dev/null 2>&1 || true
# Always restart so an in-place upgrade picks up the new binary/unit/config.
systemctl restart "$SERVICE_NAME"
sleep 5
if ! systemctl is-active --quiet "$SERVICE_NAME"; then
  log "${SERVICE_NAME} is not active; recent logs:"
  journalctl --since '1 min ago' -u "$SERVICE_NAME" -n 50 --no-pager >&2 || true
  exit 1
fi
log "${SERVICE_NAME} is active"
