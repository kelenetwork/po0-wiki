#!/usr/bin/env python3
"""Generate an nftables allowlist from maintained GitHub CIDR lists."""

from __future__ import annotations

import ipaddress
import sys
from pathlib import Path

MIN_IPV4_NETWORKS = 3000
MIN_IPV6_NETWORKS = 500


def load_networks(path: Path, version: int) -> list[ipaddress._BaseNetwork]:
    networks: list[ipaddress._BaseNetwork] = []
    for raw_line in path.read_text(encoding="ascii").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        network = ipaddress.ip_network(line, strict=False)
        if network.version != version:
            raise ValueError(f"unexpected IPv{network.version} entry in IPv{version} list: {line}")
        networks.append(network)
    return list(ipaddress.collapse_addresses(networks))


def format_elements(networks: list[ipaddress._BaseNetwork]) -> str:
    return ",\n            ".join(str(network) for network in networks)


def render(ipv4: list[ipaddress._BaseNetwork], ipv6: list[ipaddress._BaseNetwork]) -> str:
    return f"""# Generated from gaoyifan/china-operator-ip (ip-lists branch).
# Source: https://github.com/gaoyifan/china-operator-ip
# Do not edit manually.
table inet wiki_probe_cn {{
    set cn_ipv4 {{
        type ipv4_addr
        flags interval
        auto-merge
        elements = {{
            {format_elements(ipv4)}
        }}
    }}

    set cn_ipv6 {{
        type ipv6_addr
        flags interval
        auto-merge
        elements = {{
            {format_elements(ipv6)}
        }}
    }}

    chain probe_input {{
        type filter hook input priority -10; policy accept;

        iifname \"lo\" tcp dport 2053 counter accept comment \"local health checks\"
        tcp dport 2053 ip saddr @cn_ipv4 counter accept comment \"mainland China IPv4\"
        tcp dport 2053 ip6 saddr @cn_ipv6 counter accept comment \"mainland China IPv6\"
        tcp dport 2053 counter reject with tcp reset comment \"reject non-mainland probes\"
    }}
}}
"""


def main() -> int:
    if len(sys.argv) != 4:
        print(f"Usage: {sys.argv[0]} CHINA_IPV4_LIST CHINA_IPV6_LIST OUTPUT", file=sys.stderr)
        return 64

    ipv4 = load_networks(Path(sys.argv[1]), 4)
    ipv6 = load_networks(Path(sys.argv[2]), 6)
    if len(ipv4) < MIN_IPV4_NETWORKS or len(ipv6) < MIN_IPV6_NETWORKS:
        raise ValueError(
            f"GitHub CN route lists are unexpectedly small: IPv4={len(ipv4)}, IPv6={len(ipv6)}"
        )

    output = Path(sys.argv[3])
    output.write_text(render(ipv4, ipv6), encoding="ascii")
    print(f"generated IPv4={len(ipv4)} IPv6={len(ipv6)} output={output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
