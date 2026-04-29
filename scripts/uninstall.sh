#!/usr/bin/env bash
set -euo pipefail

BIN_PATH="${BIN_PATH:-/usr/local/bin/wiki-probe-agent}"
CONFIG_PATH="${CONFIG_PATH:-/etc/wiki-probe-agent.json}"
SERVICE_NAME="${SERVICE_NAME:-wiki-probe-agent.service}"
UNIT_PATH="/etc/systemd/system/${SERVICE_NAME}"

log() { printf '[wiki-probe-agent] %s\n' "$*" >&2; }

log "stopping ${SERVICE_NAME}"
systemctl disable --now "$SERVICE_NAME" || true
log "removing files"
rm -f "$UNIT_PATH" "$BIN_PATH" "$CONFIG_PATH"
systemctl daemon-reload
log "uninstalled"
