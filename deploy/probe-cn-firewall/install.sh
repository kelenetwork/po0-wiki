#!/usr/bin/env bash
set -euo pipefail

source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
timestamp=$(date -u +%Y%m%d-%H%M%S)
backup_dir="/root/backups/wiki-probe-cn-firewall-$timestamp"

for cmd in nft systemctl; do
  command -v "$cmd" >/dev/null 2>&1 || {
    printf 'Missing dependency: %s\n' "$cmd" >&2
    exit 69
  }
done

install -d -m 0700 "$backup_dir"
nft list ruleset >"$backup_dir/ruleset.before.nft"
for path in \
  /etc/wiki-probe-cn-firewall/rules.nft \
  /usr/local/sbin/wiki-probe-cn-firewall-apply \
  /etc/systemd/system/wiki-probe-cn-firewall.service; do
  if [[ -e "$path" ]]; then
    install -D -m 0600 "$path" "$backup_dir$path"
  fi
done

[[ -r "$source_dir/rules.nft" ]] || {
  printf 'Bundled rules are missing: %s/rules.nft\n' "$source_dir" >&2
  exit 66
}

install -d -m 0755 /etc/wiki-probe-cn-firewall /var/lib/wiki-probe-cn-firewall
install -m 0755 "$source_dir/wiki-probe-cn-firewall-apply" /usr/local/sbin/wiki-probe-cn-firewall-apply
install -m 0644 "$source_dir/wiki-probe-cn-firewall.service" /etc/systemd/system/wiki-probe-cn-firewall.service

# Clean up the short-lived per-node updater from the initial deployment. CN
# entry nodes cannot reliably reach APNIC; BeroDE centrally refreshes and
# pushes the list to both nodes instead.
systemctl disable --now wiki-probe-cn-firewall-update.timer >/dev/null 2>&1 || true
rm -f /etc/systemd/system/wiki-probe-cn-firewall-update.timer \
  /etc/systemd/system/wiki-probe-cn-firewall-update.service \
  /usr/local/sbin/wiki-probe-cn-firewall-update \
  /usr/local/libexec/wiki-probe-cn-firewall-generate

systemctl daemon-reload
/usr/local/sbin/wiki-probe-cn-firewall-apply "$source_dir/rules.nft"
install -m 0644 "$source_dir/rules.nft" /etc/wiki-probe-cn-firewall/rules.nft
date --iso-8601=seconds >/var/lib/wiki-probe-cn-firewall/last-success
systemctl enable --now wiki-probe-cn-firewall.service

systemctl is-active --quiet wiki-probe-cn-firewall.service
nft list table inet wiki_probe_cn >/dev/null
printf 'backup=%s\n' "$backup_dir"
printf '%s\n' 'INSTALL_COMPLETE'
