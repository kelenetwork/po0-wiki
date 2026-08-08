# Mainland-only visitor probe firewall

The public visitor latency endpoints on TCP `2053` are intentionally direct
to preserve real RTT measurements. This firewall limits those endpoints to
mainland China source addresses while leaving SSH, Agent polling, and every
other port untouched.

- Source of truth: `gaoyifan/china-operator-ip` on GitHub (`ip-lists` branch)
- Its BGP-derived `china.txt` and `china6.txt` lists are updated daily
- IPv4 and IPv6 are enforced in an isolated nftables table
- Non-CN connections to TCP `2053` are rejected with a TCP reset
- BeroDE refreshes the list daily and pushes it to both entry nodes over SSH
- Each node loads its last known-good ruleset locally during boot, before Agent

## Node deployment

Generate `rules.nft` from the repository's `china.txt` and `china6.txt`, place
it beside `install.sh`, copy the whole directory to an entry node, then run
`install.sh` as root. The installer snapshots the pre-change nftables ruleset
under `/root/backups/` and does not flush or replace unrelated nftables tables.

## Controller deployment

Install these files on BeroDE:

- `generate_rules.py` → `/usr/local/libexec/wiki-probe-cn-firewall-generate`
- `wiki-probe-cn-firewall-remote-apply` → `/usr/local/libexec/`
- `wiki-probe-cn-firewall-controller-update` → `/usr/local/sbin/`
- controller service/timer → `/etc/systemd/system/`

The controller downloads these maintained files directly from GitHub:

- `https://raw.githubusercontent.com/gaoyifan/china-operator-ip/ip-lists/china.txt`
- `https://raw.githubusercontent.com/gaoyifan/china-operator-ip/ip-lists/china6.txt`

It uses the dedicated Po0 official SSH key already stored in OpenClaw secrets
and `tools/run-remote-bash`; the private key is never copied to either entry
node. A generated list is syntax-checked locally and again on each node before
atomic table replacement. The timer only records success after both nodes have
accepted the same list.
