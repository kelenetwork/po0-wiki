import './LookingGlass.css';

type RegionGroup = {
  region: string;
  summary: string;
  nodes: Array<{
    name: string;
    provider: string;
    address: string;
    status: 'online' | 'busy' | 'standby';
  }>;
};

const regionGroups: RegionGroup[] = [
  {
    region: '香港',
    summary: 'CMI / HGC / HKIX',
    nodes: [
      { name: 'HK-Edge-01', provider: 'CMI 优化', address: '203.0.113.21', status: 'online' },
      { name: 'HK-Transit-02', provider: 'HKIX Transit', address: '203.0.113.34', status: 'busy' },
    ],
  },
  {
    region: '日本',
    summary: 'IIJ / JPIX / BBIX',
    nodes: [
      { name: 'TYO-LG-01', provider: 'IIJ Tokyo', address: '198.51.100.14', status: 'online' },
      { name: 'OSA-Test-01', provider: 'Osaka Backup', address: '198.51.100.28', status: 'standby' },
    ],
  },
  {
    region: '新加坡',
    summary: 'SGIX / Equinix',
    nodes: [
      { name: 'SIN-Core-01', provider: 'SGIX Transit', address: '192.0.2.45', status: 'online' },
    ],
  },
  {
    region: '大陆源节点',
    summary: 'CN2 / Cernet / BGP',
    nodes: [
      { name: 'SHA-Test-01', provider: '后续接入', address: '10.20.4.8', status: 'standby' },
      { name: 'CAN-Probe-01', provider: '后续接入', address: '10.24.8.12', status: 'standby' },
    ],
  },
];

const terminalLines = [
  '$ ping -c 5 wiki.kele.my --source HK-Edge-01',
  'PING wiki.kele.my (104.21.32.1): 56 data bytes',
  '64 bytes from 104.21.32.1: icmp_seq=0 ttl=57 time=18.4 ms',
  '64 bytes from 104.21.32.1: icmp_seq=1 ttl=57 time=17.9 ms',
  '64 bytes from 104.21.32.1: icmp_seq=2 ttl=57 time=19.1 ms',
  '--- wiki.kele.my ping statistics ---',
  '5 packets transmitted, 5 packets received, 0.0% packet loss',
  'round-trip min/avg/max/stddev = 17.9/18.5/19.3/0.5 ms',
];

export default function LookingGlass() {
  return (
    <section className="looking-glass-console" aria-label="Looking Glass 工具台">
      <aside className="lg-sidebar">
        <div className="lg-sidebar__head">
          <p className="status-kicker">Source Nodes</p>
          <h2>节点列表</h2>
          <span>按地区分组，可扩展接入后台节点清单。</span>
        </div>
        <div className="lg-region-list">
          {regionGroups.map((group) => (
            <article className="lg-region" key={group.region}>
              <div className="lg-region__title">
                <strong>{group.region}</strong>
                <small>{group.summary}</small>
              </div>
              {group.nodes.map((node) => (
                <button className="lg-node" type="button" key={node.name}>
                  <span className={`lg-node-dot ${node.status}`} />
                  <span>
                    <strong>{node.name}</strong>
                    <small>{node.provider} · {node.address}</small>
                  </span>
                </button>
              ))}
            </article>
          ))}
        </div>
      </aside>

      <div className="lg-workbench">
        <div className="lg-toolbar">
          <label>
            <span>工具</span>
            <select defaultValue="mtr" aria-label="选择工具">
              <option value="ping">Ping</option>
              <option value="tcping">TCPing</option>
              <option value="mtr">MTR</option>
              <option value="nexttrace">Nexttrace</option>
              <option value="traceroute">Traceroute</option>
            </select>
          </label>
          <label className="lg-target">
            <span>目标</span>
            <input defaultValue="wiki.kele.my" aria-label="目标地址" />
          </label>
          <button className="lg-run" type="button">Run</button>
        </div>

        <div className="lg-summary-grid">
          <article>
            <span>当前源</span>
            <strong>HK-Edge-01</strong>
            <small>香港 · CMI 优化</small>
          </article>
          <article>
            <span>工具</span>
            <strong>MTR</strong>
            <small>ICMP / 10 hops mock</small>
          </article>
          <article>
            <span>状态</span>
            <strong>静态预览</strong>
            <small>未连接后端执行器</small>
          </article>
        </div>

        <div className="lg-terminal-card">
          <div className="lg-terminal-top">
            <span />
            <span />
            <span />
            <strong>terminal · mock output</strong>
          </div>
          <pre>{terminalLines.join('\n')}</pre>
        </div>
      </div>
    </section>
  );
}
