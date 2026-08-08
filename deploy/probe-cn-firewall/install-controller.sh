#!/usr/bin/env bash
set -euo pipefail

source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
timestamp=$(date -u +%Y%m%d-%H%M%S)
backup_dir="/root/backups/wiki-probe-cn-firewall-controller-$timestamp"

for cmd in python3 curl nft ssh-agent ssh-add scp flock systemctl; do
  command -v "$cmd" >/dev/null 2>&1 || {
    printf 'Missing dependency: %s\n' "$cmd" >&2
    exit 69
  }
done

install -d -m 0700 "$backup_dir"
for path in \
  /usr/local/libexec/wiki-probe-cn-firewall-generate \
  /usr/local/libexec/wiki-probe-cn-firewall-remote-apply \
  /usr/local/sbin/wiki-probe-cn-firewall-controller-update \
  /etc/systemd/system/wiki-probe-cn-firewall-controller-update.service \
  /etc/systemd/system/wiki-probe-cn-firewall-controller-update.timer; do
  if [[ -e "$path" ]]; then
    install -D -m 0600 "$path" "$backup_dir$path"
  fi
done
systemctl list-unit-files 'wiki-probe-cn-firewall*' --no-pager >"$backup_dir/unit-files.before.txt" 2>&1 || true
systemctl list-timers 'wiki-probe-cn-firewall*' --all --no-pager >"$backup_dir/timers.before.txt" 2>&1 || true

install -D -m 0755 "$source_dir/generate_rules.py" /usr/local/libexec/wiki-probe-cn-firewall-generate
install -m 0755 "$source_dir/wiki-probe-cn-firewall-remote-apply" /usr/local/libexec/wiki-probe-cn-firewall-remote-apply
install -m 0755 "$source_dir/wiki-probe-cn-firewall-controller-update" /usr/local/sbin/wiki-probe-cn-firewall-controller-update
install -m 0644 "$source_dir/wiki-probe-cn-firewall-controller-update.service" /etc/systemd/system/wiki-probe-cn-firewall-controller-update.service
install -m 0644 "$source_dir/wiki-probe-cn-firewall-controller-update.timer" /etc/systemd/system/wiki-probe-cn-firewall-controller-update.timer

systemctl daemon-reload
systemctl start wiki-probe-cn-firewall-controller-update.service
systemctl enable --now wiki-probe-cn-firewall-controller-update.timer

systemctl is-active --quiet wiki-probe-cn-firewall-controller-update.timer
systemctl show wiki-probe-cn-firewall-controller-update.service -p Result --value | grep -qx success
[[ -s /var/lib/wiki-probe-cn-firewall-controller/last-success ]]
printf 'backup=%s\n' "$backup_dir"
printf '%s\n' 'CONTROLLER_INSTALL_COMPLETE'
