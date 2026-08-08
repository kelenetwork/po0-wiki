#!/usr/bin/env python3
"""Generate an nftables allowlist for APNIC-allocated mainland China IPs."""

from __future__ import annotations

import ipaddress
import sys
from pathlib import Path

MIN_IPV4_NETWORKS = 3000
MIN_IPV6_NETWORKS = 500


def load_cn_networks(path: Path) -> tuple[list[ipaddress.IPv4Network], list[ipaddress.IPv6Network]]:
    ipv4: list[ipaddress.IPv4Network] = []
    ipv6: list[ipaddress.IPv6Network] = []

    for line in path.read_text(encoding="ascii").splitlines():
        if not line or line.startswith("#"):
            continue
        fields = line.split("|")
        if len(fields) < 7:
            continue
        registry, country, resource_type, start, value, _date, status = fields[:7]
        if registry != "apnic" or country != "CN" or status not in {"allocated", "assigned"}:
            continue
        if resource_type == "ipv4":
            first = ipaddress.IPv4Address(start)
            count = int(value)
            last = ipaddress.IPv4Address(int(first) + count - 1)
            ipv4.extend(ipaddress.summarize_address_range(first, last))
        elif resource_type == "ipv6":
            ipv6.append(ipaddress.IPv6Network(f"{start}/{value}", strict=False))

    collapsed_v4 = list(ipaddress.collapse_addresses(ipv4))
    collapsed_v6 = list(ipaddress.collapse_addresses(ipv6))
    if len(collapsed_v4) < MIN_IPV4_NETWORKS or len(collapsed_v6) < MIN_IPV6_NETWORKS:
        raise ValueError(
            f"APNIC CN allocation set is unexpectedly small: "
            f"IPv4={len(collapsed_v4)}, IPv6={len(collapsed_v6)}"
        )
    return collapsed_v4, collapsed_v6


def format_elements(networks: list[ipaddress._BaseNetwork]) -> str:
    return ",\n            ".join(str(network) for network in networks)


def render(ipv4: list[ipaddress.IPv4Network], ipv6: list[ipaddress.IPv6Network]) -> str:
    return f"""# Generated from APNIC delegated data. Do not edit manually.
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
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} DELEGATED_APNIC OUTPUT", file=sys.stderr)
        return 64
    source = Path(sys.argv[1])
    output = Path(sys.argv[2])
    ipv4, ipv6 = load_cn_networks(source)
    output.write_text(render(ipv4, ipv6), encoding="ascii")
    print(f"generated IPv4={len(ipv4)} IPv6={len(ipv6)} output={output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
