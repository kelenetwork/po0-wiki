# Mainland-only visitor probe firewall

The public visitor latency endpoints on TCP `2053` are intentionally direct
to preserve real RTT measurements. This firewall limits those endpoints to
mainland China source addresses while leaving SSH, Agent polling, and every
other port untouched.

- Source of truth: `gaoyifan/china-operator-ip` on GitHub (`ip-lists` branch)
- Its BGP-derived `china.txt` and `china6.txt` lists are updated daily
- IPv4 and IPv6 are enforced in an isolated nftables table
- Non-CN connections to TCP `2053` are rejected with a TCP reset
- Each entry node refreshes its own list daily through the HTTP(S) proxy already
  configured on `wiki-probe-agent.service`
- No proxy URL or credentials are duplicated into the firewall units
- The last known-good ruleset loads locally during boot, before the Agent

## Deployment

Generate `rules.nft` from the repository's `china.txt` and `china6.txt`, place
it beside `install.sh`, copy the whole directory to an entry node, then run
`install.sh` as root. The installer:

1. snapshots the pre-change nftables and unit state under `/root/backups/`;
2. installs the boot ruleset and local daily updater;
3. runs one real update through the Agent's existing proxy;
4. enables `wiki-probe-cn-firewall-update.timer` only after verification.

The updater downloads:

- `https://raw.githubusercontent.com/gaoyifan/china-operator-ip/ip-lists/china.txt`
- `https://raw.githubusercontent.com/gaoyifan/china-operator-ip/ip-lists/china6.txt`

It reads `HTTP_PROXY` / `HTTPS_PROXY` from the existing Agent unit at runtime,
validates CIDR family and minimum list sizes, checks the nftables transaction,
and only then replaces the active and persisted rules. A failed download or
validation leaves the previous ruleset active.
