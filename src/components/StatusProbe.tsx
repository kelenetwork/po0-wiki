import './StatusProbe.css';
import { mockProbeSnapshot, PublicProbeCheck, PublicProbeSnapshot, usePublicProbeSnapshot } from './probeSnapshot';

type ProbeStatus = 'online' | 'warn' | 'pending';

type TargetLatency = {
  id: string;
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

const toneCycle: TargetLatency['tone'][] = ['green', 'blue', 'amber', 'violet'];

function safeStatus(status: string): ProbeStatus {
  if (status === 'online' || status === 'ok') return 'online';
  if (status === 'warn' || status === 'degraded') return 'warn';
  return 'pending';
}

function metricValue(value: number, suffix: string) {
  return value > 0 ? `${value}${suffix}` : '待接入';
}

function findName(snapshot: PublicProbeSnapshot, kind: 'sources' | 'targets', id: string) {
  return snapshot[kind].find((item) => item.id === id)?.display_name ?? id;
}

function toLatencyCards(snapshot: PublicProbeSnapshot): TargetLatency[] {
  return snapshot.checks.map((check, index) => ({
    id: check.id,
    target: findName(snapshot, 'targets', check.target_id),
    location: check.display_name || `${findName(snapshot, 'sources', check.source_id)} → ${findName(snapshot, 'targets', check.target_id)}`,
    latency: metricValue(check.latency_ms, ' ms'),
    jitter: check.jitter_ms > 0 ? `±${check.jitter_ms} ms` : '—',
    loss: `${check.loss_pct}%`,
    tone: check.status === 'warn' ? 'amber' : toneCycle[index % toneCycle.length],
  }));
}

function chartPath(check: PublicProbeCheck | undefined, snapshot: PublicProbeSnapshot) {
  const series = snapshot.series.find((item) => item.check_id === check?.id) ?? snapshot.series[0];
  const points = series?.points ?? [];
  if (points.length < 2) {
    return 'M48 214 C120 188 150 178 220 186 S340 126 420 142 S540 198 620 150 S740 86 862 116';
  }

  const values = points.map((point) => point.latency_ms);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);
  return points.map((point, index) => {
    const x = 48 + (814 * index) / (points.length - 1);
    const y = 250 - ((point.latency_ms - min) / span) * 150;
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
}

export default function StatusProbe({ compact = false }: StatusProbeProps) {
  const { snapshot, origin } = usePublicProbeSnapshot();
  const targetLatencies = toLatencyCards(snapshot);
  const compactTargets = targetLatencies.slice(0, 3);
  const trendPath = chartPath(snapshot.checks[0], snapshot);
  const safeSnapshot = targetLatencies.length > 0 ? snapshot : mockProbeSnapshot;

  if (compact) {
    return (
      <section className="status-probe compact">
        <div className="status-head">
          <div>
            <p className="status-kicker">Network NOC</p>
            <h3>网络探测预览</h3>
          </div>
          <span className="status-pill">{origin === 'api' ? 'Live API' : 'Mock fallback'}</span>
        </div>
        <div className="probe-list">
          {compactTargets.map((probe) => (
            <div className="probe-row" key={probe.id}>
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
          <span>{origin === 'api' ? 'Public Snapshot API · 已隐藏敏感连接信息' : 'Mock fallback · API 不可用时展示安全模拟数据'}</span>
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
            <strong>{safeSnapshot.sources.length} 个区域</strong>
          </div>
          <div className="source-node-list">
            {safeSnapshot.sources.map((node) => (
              <article className="source-node-card" key={node.id}>
                <div className="source-node-card__main">
                  <span className={`dot ${safeStatus(node.status)}`} />
                  <div>
                    <strong>{node.display_name}</strong>
                    <small>{node.region} · {node.tags.join(' / ') || 'public'}</small>
                  </div>
                </div>
                <div className="source-node-card__meta">
                  <code>{safeStatus(node.status)}</code>
                  <span>更新时间 {node.updated_at || '—'}</span>
                </div>
              </article>
            ))}
          </div>
        </aside>

        <div className="status-main-panel">
          <div className="latency-grid" aria-label="目标延迟卡片">
            {targetLatencies.map((item) => (
              <article className={`latency-card latency-card--${item.tone}`} key={item.id}>
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
                {safeSnapshot.sources.slice(0, 3).map((node, index) => (
                  <span key={node.id}><i className={toneCycle[index]} />{node.region}</span>
                ))}
              </div>
            </div>
            <svg className="latency-chart" viewBox="0 0 900 320" role="img" aria-label="延迟折线图">
              <defs>
                <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.24" />
                  <stop offset="100%" stopColor="#14b8a6" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[70, 130, 190, 250].map((y) => <line key={y} x1="42" x2="872" y1={y} y2={y} />)}
              {[80, 220, 360, 500, 640, 780].map((x) => <line key={x} x1={x} x2={x} y1="42" y2="282" />)}
              <path className="chart-area" d={`${trendPath} L862 282 L48 282 Z`} />
              <path className="chart-line chart-line--green" d={trendPath} />
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
