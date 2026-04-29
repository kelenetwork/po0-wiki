import { useEffect, useMemo, useState } from 'react';
import './StatusProbe.css';
import { mockProbeSnapshot, PublicProbeItem, PublicProbeSnapshot, PublicProbeSeries, usePublicProbeSnapshot } from './probeSnapshot';

type ProbeStatus = 'online' | 'warn' | 'pending';

type TargetLatency = {
  id: string;
  sourceId: string;
  target: string;
  location: string;
  latency: string;
  jitter: string;
  loss: string;
  tone: 'green' | 'blue' | 'amber' | 'violet';
  pending: boolean;
};

type ChartSeries = {
  id: string;
  color: string;
  segments: string[][];
};

type StatusProbeProps = {
  compact?: boolean;
};

const toneCycle: TargetLatency['tone'][] = ['green', 'blue', 'amber', 'violet'];
const chartColors = ['#14b8a6', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'];

function safeStatus(status: string): ProbeStatus {
  if (status === 'online' || status === 'ok') return 'online';
  if (status === 'warn' || status === 'degraded') return 'warn';
  return 'pending';
}

function isOnline(status: string) {
  return safeStatus(status) === 'online';
}

function metricValue(value: number, suffix: string, digits = 2) {
  return value > 0 ? `${value.toFixed(digits)}${suffix}` : '待接入';
}

function lossValue(value: number) {
  return `${Math.round(value)}%`;
}

function relativeTime(value: string) {
  if (!value) return '—';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return value;
  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSeconds < 60) return '刚刚';
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} 小时前`;
  return `${Math.floor(diffHours / 24)} 天前`;
}

function formatTimeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function findName(snapshot: PublicProbeSnapshot, kind: 'sources' | 'targets', id: string) {
  return snapshot[kind].find((item) => item.id === id)?.display_name ?? id;
}

function toLatencyCards(snapshot: PublicProbeSnapshot): TargetLatency[] {
  return snapshot.checks.map((check, index) => {
    const pending = check.latency_ms <= 0 && check.loss_pct >= 100;
    return {
      id: check.id,
      sourceId: check.source_id,
      target: findName(snapshot, 'targets', check.target_id),
      location: check.display_name || `${findName(snapshot, 'sources', check.source_id)} → ${findName(snapshot, 'targets', check.target_id)}`,
      latency: metricValue(check.latency_ms, ' ms'),
      jitter: check.jitter_ms > 0 ? `±${check.jitter_ms.toFixed(2)} ms` : '—',
      loss: lossValue(check.loss_pct),
      tone: pending ? 'amber' : check.status === 'warn' ? 'amber' : toneCycle[index % toneCycle.length],
      pending,
    };
  });
}

function buildChartSeries(snapshot: PublicProbeSnapshot, selectedIds: string[]): ChartSeries[] {
  const checksById = new Map(snapshot.checks.map((check) => [check.id, check]));
  const visibleSeries = snapshot.series.filter((series) => selectedIds.includes(series.check_id));
  const validPoints = visibleSeries.flatMap((series) => series.points.filter((point) => point.latency_ms > 0 && point.loss_pct < 100));
  const times = validPoints.map((point) => new Date(point.updated_at).getTime()).filter(Number.isFinite);
  const values = validPoints.map((point) => point.latency_ms);
  const minTime = times.length ? Math.min(...times) : Date.now() - 86_400_000;
  const maxTime = times.length ? Math.max(...times) : Date.now();
  const minLatency = values.length ? Math.min(...values) : 0;
  const maxLatency = values.length ? Math.max(...values) : 100;
  const timeSpan = Math.max(maxTime - minTime, 1);
  const latencySpan = Math.max(maxLatency - minLatency, 10);

  return visibleSeries.map((series, index) => {
    const check = checksById.get(series.check_id);
    const segments: string[][] = [];
    let current: string[] = [];
    series.points.forEach((point) => {
      const pointTime = new Date(point.updated_at).getTime();
      const broken = point.latency_ms <= 0 || point.loss_pct >= 100 || !Number.isFinite(pointTime);
      if (broken) {
        if (current.length > 1) segments.push(current);
        current = [];
        return;
      }
      const x = 58 + ((pointTime - minTime) / timeSpan) * 794;
      const y = 250 - ((point.latency_ms - minLatency) / latencySpan) * 170;
      current.push(`${current.length === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`);
    });
    if (current.length > 1) segments.push(current);
    return {
      id: series.check_id,
      color: chartColors[index % chartColors.length],
      segments,
    };
  });
}

function defaultSelectedSeries(series: PublicProbeSeries[]) {
  const healthy = series.filter((item) => item.points.some((point) => point.latency_ms > 0 && point.loss_pct < 100));
  return healthy.slice(0, 3).map((item) => item.check_id);
}

function defaultSourceId(sources: PublicProbeItem[]) {
  return sources.find((source) => isOnline(source.status))?.id ?? sources[0]?.id ?? 'all';
}

export default function StatusProbe({ compact = false }: StatusProbeProps) {
  const { snapshot, origin } = usePublicProbeSnapshot();
  const safeSnapshot = snapshot.checks.length > 0 ? snapshot : mockProbeSnapshot;
  const targetLatencies = toLatencyCards(safeSnapshot);
  const compactTargets = targetLatencies.slice(0, 3);
  const [selectedSourceId, setSelectedSourceId] = useState(defaultSourceId(safeSnapshot.sources));
  const [selectedSeriesIds, setSelectedSeriesIds] = useState<string[]>(defaultSelectedSeries(safeSnapshot.series));

  useEffect(() => {
    setSelectedSourceId(defaultSourceId(safeSnapshot.sources));
    setSelectedSeriesIds(defaultSelectedSeries(safeSnapshot.series));
  }, [safeSnapshot]);

  const filteredLatencies = selectedSourceId === 'all'
    ? targetLatencies
    : targetLatencies.filter((item) => item.sourceId === selectedSourceId);
  const chartSeries = useMemo(() => buildChartSeries(safeSnapshot, selectedSeriesIds), [safeSnapshot, selectedSeriesIds]);
  const selectedSource = safeSnapshot.sources.find((source) => source.id === selectedSourceId);
  const chartPoints = safeSnapshot.series.flatMap((series) => series.points);
  const firstPoint = chartPoints[0]?.updated_at;
  const lastPoint = chartPoints[chartPoints.length - 1]?.updated_at;

  function toggleSeries(checkId: string) {
    setSelectedSeriesIds((current) => current.includes(checkId)
      ? current.filter((id) => id !== checkId)
      : [...current, checkId]);
  }

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
              <span className={`dot ${probe.pending ? 'pending' : probe.tone === 'amber' ? 'warn' : 'online'}`} />
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
    <section className="status-probe status-dashboard kele-status" aria-label="网络监控总览">
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
            {safeSnapshot.sources.map((node) => {
              const status = safeStatus(node.status);
              return (
                <article className="source-node-card" key={node.id}>
                  <div className="source-node-card__main">
                    <span className={`dot ${status}`} />
                    <div>
                      <strong>{node.display_name}</strong>
                      <small>{node.region} · {node.tags.join(' / ') || 'public'}</small>
                    </div>
                  </div>
                  <div className="source-node-card__meta">
                    <span className={`node-status node-status--${status}`}><i />{status}</span>
                    <span title={node.updated_at}>更新于 {relativeTime(node.updated_at)}</span>
                  </div>
                </article>
              );
            })}
          </div>
        </aside>

        <div className="status-main-panel">
          <div className="source-filter" aria-label="源节点筛选">
            <button type="button" className={selectedSourceId === 'all' ? 'active' : ''} onClick={() => setSelectedSourceId('all')}>全部</button>
            {safeSnapshot.sources.map((source) => (
              <button type="button" className={selectedSourceId === source.id ? 'active' : ''} key={source.id} onClick={() => setSelectedSourceId(source.id)}>
                <span className={`dot ${safeStatus(source.status)}`} />{source.display_name}
              </button>
            ))}
          </div>

          <div className="latency-grid" aria-label="目标延迟卡片">
            {filteredLatencies.map((item) => (
              <article className={`latency-card latency-card--${item.tone}${item.pending ? ' latency-card--pending' : ''}`} key={item.id}>
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
                <small>{selectedSource ? `当前筛选：${selectedSource.display_name}` : '多选图例可叠加更多线路'}</small>
              </div>
              <div className="status-legend" aria-label="曲线图例">
                {safeSnapshot.series.map((series, index) => {
                  const check = safeSnapshot.checks.find((item) => item.id === series.check_id);
                  const active = selectedSeriesIds.includes(series.check_id);
                  return (
                    <button type="button" className={active ? 'active' : ''} key={series.check_id} onClick={() => toggleSeries(series.check_id)}>
                      <i style={{ background: chartColors[index % chartColors.length] }} />{check?.display_name || series.check_id}
                    </button>
                  );
                })}
              </div>
            </div>
            <svg className="latency-chart" viewBox="0 0 900 320" role="img" aria-label="真实延迟折线图">
              {[70, 130, 190, 250].map((y) => <line key={y} x1="58" x2="852" y1={y} y2={y} />)}
              {[58, 256, 455, 654, 852].map((x) => <line key={x} x1={x} x2={x} y1="46" y2="250" />)}
              <text x="58" y="286">{firstPoint ? formatTimeLabel(firstPoint) : '00:00'}</text>
              <text x="420" y="286">Latency / ms</text>
              <text x="790" y="286">{lastPoint ? formatTimeLabel(lastPoint) : '24:00'}</text>
              {chartSeries.map((series) => series.segments.map((segment, index) => (
                <path className="chart-line" d={segment.join(' ')} key={`${series.id}-${index}`} stroke={series.color} />
              )))}
              {chartSeries.length === 0 && <text x="320" y="164">暂无可绘制的真实延迟点</text>}
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}
