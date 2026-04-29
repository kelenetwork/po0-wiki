import './StatusProbe.css';

type ProbeStatus = 'online' | 'warn' | 'pending';

type SourceNode = {
  region: string;
  name: string;
  provider: string;
  ipv4: string;
  status: ProbeStatus;
  load: string;
};

type TargetLatency = {
  target: string;
  location: string;
  latency: string;
  jitter: string;
  loss: string;
  tone: 'green' | 'blue' | 'amber' | 'violet';
};

type StatusProbeProps = {
  compact?: boolean;
};

const sourceNodes: SourceNode[] = [
  { region: '香港', name: 'HK-Edge-01', provider: 'CMI / HGC', ipv4: '203.0.113.21', status: 'online', load: '31%' },
  { region: '日本', name: 'TYO-LG-02', provider: 'IIJ / JPIX', ipv4: '198.51.100.14', status: 'online', load: '24%' },
  { region: '新加坡', name: 'SIN-Core-01', provider: 'SGIX Transit', ipv4: '192.0.2.45', status: 'warn', load: '48%' },
  { region: '大陆源', name: 'SHA-Test-01', provider: 'CN2 / Cernet', ipv4: '10.20.4.8', status: 'pending', load: '待接入' },
];

const targetLatencies: TargetLatency[] = [
  { target: 'wiki.kele.my', location: '香港 → Wiki', latency: '18 ms', jitter: '±2.4 ms', loss: '0%', tone: 'green' },
  { target: 'api.kele.my', location: '东京 → API', latency: '42 ms', jitter: '±5.1 ms', loss: '0%', tone: 'blue' },
  { target: 'cdn.kele.my', location: '新加坡 → CDN', latency: '67 ms', jitter: '±8.7 ms', loss: '0.2%', tone: 'amber' },
  { target: 'origin.kele.internal', location: '大陆源 → Origin', latency: '待接入', jitter: '—', loss: '—', tone: 'violet' },
];

const compactTargets = targetLatencies.slice(0, 3);

export default function StatusProbe({ compact = false }: StatusProbeProps) {
  if (compact) {
    return (
      <section className="status-probe compact">
        <div className="status-head">
          <div>
            <p className="status-kicker">Network NOC</p>
            <h3>网络探测预览</h3>
          </div>
          <span className="status-pill">静态 UI</span>
        </div>
        <div className="probe-list">
          {compactTargets.map((probe) => (
            <div className="probe-row" key={probe.target}>
              <span className={`dot ${probe.tone === 'amber' ? 'warn' : 'online'}`} />
              <div>
                <strong>{probe.target}</strong>
                <small>{probe.location}</small>
              </div>
              <em>{probe.latency}</em>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="status-probe status-dashboard" aria-label="网络监控总览">
      <div className="status-dashboard__topbar">
        <div>
          <p className="status-kicker">Looking Glass Monitor</p>
          <h2>网络监控总览</h2>
          <span>静态 Mock 数据 · 后续可接入 Probe API / 时序数据库</span>
        </div>
        <div className="status-tabs" aria-label="时间范围">
          <button type="button" className="active">1天</button>
          <button type="button">7天</button>
          <button type="button">30天</button>
        </div>
      </div>

      <div className="status-layout">
        <aside className="status-source-panel" aria-label="源节点概览">
          <div className="status-panel-title">
            <span>源节点</span>
            <strong>{sourceNodes.length} 个区域</strong>
          </div>
          <div className="source-node-list">
            {sourceNodes.map((node) => (
              <article className="source-node-card" key={node.name}>
                <div className="source-node-card__main">
                  <span className={`dot ${node.status}`} />
                  <div>
                    <strong>{node.name}</strong>
                    <small>{node.region} · {node.provider}</small>
                  </div>
                </div>
                <div className="source-node-card__meta">
                  <code>{node.ipv4}</code>
                  <span>负载 {node.load}</span>
                </div>
              </article>
            ))}
          </div>
        </aside>

        <div className="status-main-panel">
          <div className="latency-grid" aria-label="目标延迟卡片">
            {targetLatencies.map((item) => (
              <article className={`latency-card latency-card--${item.tone}`} key={item.target}>
                <span>{item.location}</span>
                <strong>{item.latency}</strong>
                <p>{item.target}</p>
                <div>
                  <small>抖动 {item.jitter}</small>
                  <small>丢包 {item.loss}</small>
                </div>
              </article>
            ))}
          </div>

          <div className="status-chart-card">
            <div className="status-chart-head">
              <div>
                <p className="status-kicker">Latency Trend</p>
                <h3>24 小时延迟曲线</h3>
              </div>
              <div className="status-legend">
                <span><i className="green" />香港</span>
                <span><i className="blue" />日本</span>
                <span><i className="amber" />新加坡</span>
              </div>
            </div>
            <svg className="latency-chart" viewBox="0 0 900 320" role="img" aria-label="延迟折线图 mock">
              <defs>
                <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.24" />
                  <stop offset="100%" stopColor="#14b8a6" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[70, 130, 190, 250].map((y) => <line key={y} x1="42" x2="872" y1={y} y2={y} />)}
              {[80, 220, 360, 500, 640, 780].map((x) => <line key={x} x1={x} x2={x} y1="42" y2="282" />)}
              <path className="chart-area" d="M48 214 C120 188 150 178 220 186 S340 126 420 142 S540 198 620 150 S740 86 862 116 L862 282 L48 282 Z" />
              <path className="chart-line chart-line--green" d="M48 214 C120 188 150 178 220 186 S340 126 420 142 S540 198 620 150 S740 86 862 116" />
              <path className="chart-line chart-line--blue" d="M48 238 C130 220 174 202 238 214 S360 164 446 178 S566 216 650 188 S760 142 862 154" />
              <path className="chart-line chart-line--amber" d="M48 182 C112 170 164 206 238 194 S346 92 438 118 S560 176 646 130 S752 196 862 172" />
              <text x="44" y="310">00:00</text>
              <text x="424" y="310">12:00</text>
              <text x="812" y="310">24:00</text>
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}
