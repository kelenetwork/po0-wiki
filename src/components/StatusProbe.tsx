import { type MouseEvent, useEffect, useMemo, useState } from 'react';
import './StatusProbe.css';
import { mockProbeSnapshot, PublicProbeItem, PublicProbePoint, PublicProbeSnapshot, PublicProbeSeries, usePublicProbeSnapshot } from './probeSnapshot';

type ProbeStatus = 'online' | 'warn' | 'pending' | 'offline';

type TargetLatency = {
  id: string;
  sourceId: string;
  target: string;
  location: string;
  latencyValue: string;
  latencyUnit: string;
  jitter: string;
  loss: string;
  tone: 'green' | 'blue' | 'amber' | 'violet';
  pending: boolean;
};

type ChartPoint = PublicProbePoint & {
  time: number;
  x: number;
  y: number;
  lowY: number;
  highY: number;
};

type ChartSeries = {
  id: string;
  label: string;
  color: string;
  points: ChartPoint[];
  path: string;
};

type ChartTick = {
  value: number;
  label: string;
  x?: number;
  y?: number;
};

type ChartModel = {
  series: ChartSeries[];
  xTicks: ChartTick[];
  yTicks: ChartTick[];
  lossBins: { x: number; width: number; loss: number }[];
  empty: boolean;
};

type HoverPoint = {
  x: number;
  y: number;
  seriesLabel: string;
  color: string;
  time: number;
  latency: number;
  jitter: number;
  loss: number;
};

type StatusProbeProps = {
  compact?: boolean;
};

const toneCycle: TargetLatency['tone'][] = ['green', 'blue', 'amber', 'violet'];
const chartColors = ['#14b8a6', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'];
const chartBounds = { left: 64, right: 844, top: 34, bottom: 252, heatTop: 286, heatHeight: 16 };
const chartWidth = chartBounds.right - chartBounds.left;
const chartHeight = chartBounds.bottom - chartBounds.top;
const dayMs = 24 * 60 * 60 * 1000;
const tickMs = 4 * 60 * 60 * 1000;

function safeStatus(status: string): ProbeStatus {
  if (status === 'online' || status === 'ok') return 'online';
  if (status === 'warn' || status === 'degraded') return 'warn';
  if (status === 'offline' || status === 'down') return 'offline';
  return 'pending';
}

function isOnline(status: string) {
  return safeStatus(status) === 'online';
}

function metricValue(value: number, digits = 2) {
  return value > 0 ? value.toFixed(digits) : '待接入';
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

function formatTimeLabel(value: string | number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatTooltipTime(value: number) {
  const date = new Date(value);
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function findName(snapshot: PublicProbeSnapshot, kind: 'sources' | 'targets', id: string) {
  return snapshot[kind].find((item) => item.id === id)?.display_name ?? id;
}

function colorForSeries(snapshot: PublicProbeSnapshot, checkId: string) {
  const index = Math.max(0, snapshot.series.findIndex((series) => series.check_id === checkId));
  return chartColors[index % chartColors.length];
}

function toLatencyCards(snapshot: PublicProbeSnapshot): TargetLatency[] {
  return snapshot.checks.map((check, index) => {
    const pending = check.latency_ms <= 0 && check.loss_pct >= 100;
    return {
      id: check.id,
      sourceId: check.source_id,
      target: findName(snapshot, 'targets', check.target_id),
      location: check.display_name || `${findName(snapshot, 'sources', check.source_id)} → ${findName(snapshot, 'targets', check.target_id)}`,
      latencyValue: metricValue(check.latency_ms),
      latencyUnit: check.latency_ms > 0 ? 'ms' : '',
      jitter: check.jitter_ms > 0 ? `±${check.jitter_ms.toFixed(2)} ms` : '—',
      loss: lossValue(check.loss_pct),
      tone: pending ? 'amber' : check.status === 'warn' ? 'amber' : toneCycle[index % toneCycle.length],
      pending,
    };
  });
}

function pointTime(point: PublicProbePoint) {
  const time = new Date(point.updated_at).getTime();
  return Number.isFinite(time) ? time : NaN;
}

function buildPath(points: ChartPoint[]) {
  const segments: string[] = [];
  let current: string[] = [];
  points.forEach((point) => {
    const broken = point.latency_ms <= 0 || point.loss_pct >= 100;
    if (broken) {
      if (current.length > 1) segments.push(current.join(' '));
      current = [];
      return;
    }
    current.push(`${current.length === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`);
  });
  if (current.length > 1) segments.push(current.join(' '));
  return segments.join(' ');
}

function niceStep(rawStep: number) {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(rawStep, 1)));
  const normalized = rawStep / magnitude;
  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

function buildChartModel(snapshot: PublicProbeSnapshot, selectedIds: string[]): ChartModel {
  const checksById = new Map(snapshot.checks.map((check) => [check.id, check]));
  const visibleSeries = snapshot.series.filter((series) => selectedIds.includes(series.check_id));
  const allTimedPoints = visibleSeries.flatMap((series) => series.points.map((point) => ({ ...point, time: pointTime(point) })).filter((point) => Number.isFinite(point.time)));
  const maxObservedTime = allTimedPoints.length ? Math.max(...allTimedPoints.map((point) => point.time)) : Date.now();
  const minTime = maxObservedTime - dayMs;
  const maxTime = maxObservedTime;
  const visiblePoints = allTimedPoints.filter((point) => point.time >= minTime && point.time <= maxTime);
  const usablePoints = visiblePoints.filter((point) => point.latency_ms > 0 && point.loss_pct < 100);
  const lowValues = usablePoints.map((point) => Math.max(0, point.latency_ms - Math.max(point.jitter_ms, 1)));
  const highValues = usablePoints.map((point) => point.latency_ms + Math.max(point.jitter_ms, 1));
  const minLatency = lowValues.length ? Math.min(...lowValues) : 0;
  const maxLatency = highValues.length ? Math.max(...highValues) : 100;
  const yStep = niceStep((maxLatency - minLatency || 100) / 4);
  const yMin = Math.max(0, Math.floor(minLatency / yStep) * yStep);
  const yMax = Math.max(yMin + yStep * 4, Math.ceil(maxLatency / yStep) * yStep);
  const xForTime = (time: number) => chartBounds.left + ((time - minTime) / dayMs) * chartWidth;
  const yForLatency = (latency: number) => chartBounds.bottom - ((latency - yMin) / (yMax - yMin)) * chartHeight;
  const xTicks: ChartTick[] = [];
  const firstTick = Math.ceil(minTime / tickMs) * tickMs;
  for (let tick = firstTick; tick <= maxTime + 1; tick += tickMs) {
    xTicks.push({ value: tick, label: formatTimeLabel(tick), x: xForTime(tick) });
  }
  const yTicks: ChartTick[] = [];
  for (let tick = yMin; tick <= yMax + yStep / 2; tick += yStep) {
    yTicks.push({ value: tick, label: `${Math.round(tick)}`, y: yForLatency(tick) });
  }
  const series = visibleSeries.map((rawSeries) => {
    const label = checksById.get(rawSeries.check_id)?.display_name || rawSeries.check_id;
    const points = rawSeries.points
      .map((point) => ({ ...point, time: pointTime(point) }))
      .filter((point) => Number.isFinite(point.time) && point.time >= minTime && point.time <= maxTime)
      .map((point) => ({
        ...point,
        x: xForTime(point.time),
        y: yForLatency(point.latency_ms),
        lowY: yForLatency(Math.max(0, point.latency_ms - Math.max(point.jitter_ms, 1))),
        highY: yForLatency(point.latency_ms + Math.max(point.jitter_ms, 1)),
      }));
    return { id: rawSeries.check_id, label, color: colorForSeries(snapshot, rawSeries.check_id), points, path: buildPath(points) };
  });
  const binCount = 72;
  const binWidth = chartWidth / binCount;
  const lossBins = Array.from({ length: binCount }, (_, index) => {
    const start = minTime + (dayMs / binCount) * index;
    const end = start + dayMs / binCount;
    const points = visiblePoints.filter((point) => point.time >= start && point.time < end);
    const loss = points.length ? Math.max(...points.map((point) => point.loss_pct)) : 0;
    return { x: chartBounds.left + index * binWidth, width: Math.max(1, binWidth - 1), loss };
  });
  return { series, xTicks, yTicks, lossBins, empty: usablePoints.length === 0 };
}

function defaultSelectedSeries(series: PublicProbeSeries[]) {
  const healthy = series.filter((item) => item.points.some((point) => point.latency_ms > 0 && point.loss_pct < 100));
  return healthy.slice(0, 3).map((item) => item.check_id);
}

function defaultSourceId(sources: PublicProbeItem[]) {
  return sources.find((source) => isOnline(source.status))?.id ?? sources[0]?.id ?? 'all';
}

function lossFill(loss: number) {
  if (loss <= 0) return 'rgba(148, 163, 184, 0.16)';
  const opacity = Math.min(0.88, 0.22 + loss / 130);
  return `rgba(239, 68, 68, ${opacity.toFixed(2)})`;
}

export default function StatusProbe({ compact = false }: StatusProbeProps) {
  const { snapshot, origin } = usePublicProbeSnapshot();
  const safeSnapshot = snapshot.checks.length > 0 ? snapshot : mockProbeSnapshot;
  const targetLatencies = toLatencyCards(safeSnapshot);
  const compactTargets = targetLatencies.slice(0, 3);
  const [selectedSourceId, setSelectedSourceId] = useState(defaultSourceId(safeSnapshot.sources));
  const [selectedSeriesIds, setSelectedSeriesIds] = useState<string[]>(defaultSelectedSeries(safeSnapshot.series));
  const [hoverPoint, setHoverPoint] = useState<HoverPoint | null>(null);

  useEffect(() => {
    setSelectedSourceId(defaultSourceId(safeSnapshot.sources));
    setSelectedSeriesIds(defaultSelectedSeries(safeSnapshot.series));
  }, [safeSnapshot]);

  const filteredLatencies = selectedSourceId === 'all'
    ? targetLatencies
    : targetLatencies.filter((item) => item.sourceId === selectedSourceId);
  const chartModel = useMemo(() => buildChartModel(safeSnapshot, selectedSeriesIds), [safeSnapshot, selectedSeriesIds]);
  const selectedSource = safeSnapshot.sources.find((source) => source.id === selectedSourceId);
  const allSeriesSelected = safeSnapshot.series.length > 0 && selectedSeriesIds.length === safeSnapshot.series.length;

  function toggleAllSeries() {
    setSelectedSeriesIds(allSeriesSelected ? [] : safeSnapshot.series.map((series) => series.check_id));
  }

  function toggleSeries(checkId: string) {
    setSelectedSeriesIds((current) => current.includes(checkId)
      ? current.filter((id) => id !== checkId)
      : [...current, checkId]);
  }

  function handleChartMove(event: MouseEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 900;
    const candidates = chartModel.series.flatMap((series) => series.points
      .filter((point) => point.latency_ms > 0)
      .map((point) => ({ series, point, distance: Math.abs(point.x - x) })));
    const nearest = candidates.sort((a, b) => a.distance - b.distance)[0];
    if (!nearest || nearest.distance > 28) {
      setHoverPoint(null);
      return;
    }
    setHoverPoint({
      x: nearest.point.x,
      y: nearest.point.y,
      seriesLabel: nearest.series.label,
      color: nearest.series.color,
      time: nearest.point.time,
      latency: nearest.point.latency_ms,
      jitter: nearest.point.jitter_ms,
      loss: nearest.point.loss_pct,
    });
  }

  if (compact) {
    return (
      <section className="status-probe compact">
        <div className="status-head">
          <div>
            <p className="status-kicker">Po0 Atlas</p>
            <h3>实时路径</h3>
          </div>
          <span className="status-pill">{origin === 'api' ? 'Live' : 'Syncing'}</span>
        </div>
        <div className="probe-list">
          {compactTargets.map((probe) => (
            <div className="probe-row" key={probe.id}>
              <span className={`dot ${probe.pending ? 'pending' : probe.tone === 'amber' ? 'warn' : 'online'}`} />
              <div>
                <strong>{probe.target}</strong>
                <small>{probe.location}</small>
              </div>
              <em>{probe.latencyValue}{probe.latencyUnit && <span className="unit"> {probe.latencyUnit}</span>}</em>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="status-probe status-dashboard kele-status" aria-label="链路状态">
      <div className="status-dashboard__topbar">
        <div>
          <span className="status-source-meta">{origin === 'api' ? '公网快照 · 已脱敏' : '读取快照中'}</span>
        </div>
        <div className="status-tabs" aria-label="时间范围">
          <button type="button" className="active">1天</button>
          <button type="button">7天</button>
          <button type="button">30天</button>
        </div>
      </div>

      <div className="status-layout">
        <aside className="status-source-panel" aria-label="源节点">
          <div className="status-panel-title">
            <span>源节点</span>
            <strong>{safeSnapshot.sources.length} 个节点</strong>
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
                <span className="latency-card__route">{item.location}</span>
                <strong className="latency-card__value">
                  <span>{item.latencyValue}</span>{item.latencyUnit && <span className="unit">{item.latencyUnit}</span>}
                </strong>
                <p className="latency-card__target">{item.target}</p>
                <div className="latency-card__meta">
                  <small>抖动 {item.jitter}</small>
                  <small>丢包 {item.loss}</small>
                </div>
              </article>
            ))}
          </div>

          <div className="status-chart-card">
            <div className="status-chart-head">
              <div>
                <p className="status-kicker">Route Trace</p>
                <h3>24h 延迟轨迹</h3>
                <small>{selectedSource ? `当前筛选：${selectedSource.display_name}` : '点击线路名切换显示'}</small>
              </div>
              <div className="status-legend" aria-label="线路图例">
                <button type="button" className={allSeriesSelected ? 'active' : ''} onClick={toggleAllSeries}>全选</button>
                {safeSnapshot.series.map((series) => {
                  const check = safeSnapshot.checks.find((item) => item.id === series.check_id);
                  const active = selectedSeriesIds.includes(series.check_id);
                  return (
                    <button type="button" className={active ? 'active' : ''} key={series.check_id} onClick={() => toggleSeries(series.check_id)}>
                      <i style={{ background: colorForSeries(safeSnapshot, series.check_id) }} />{check?.display_name || series.check_id}
                    </button>
                  );
                })}
              </div>
            </div>
            <svg className="latency-chart" viewBox="0 0 900 340" preserveAspectRatio="xMidYMid meet" role="img" aria-label="SmokePing 风格 24h 延迟轨迹" onMouseMove={handleChartMove} onMouseLeave={() => setHoverPoint(null)}>
              {chartModel.yTicks.map((tick) => <line className="chart-grid" key={`y-${tick.value}`} x1={chartBounds.left} x2={chartBounds.right} y1={tick.y} y2={tick.y} />)}
              {chartModel.xTicks.map((tick) => <line className="chart-grid chart-grid--vertical" key={`x-${tick.value}`} x1={tick.x} x2={tick.x} y1={chartBounds.top} y2={chartBounds.bottom} />)}
              {chartModel.yTicks.map((tick) => <text className="chart-axis" key={`yt-${tick.value}`} x="54" y={(tick.y ?? 0) + 4} textAnchor="end">{tick.label}</text>)}
              {chartModel.xTicks.map((tick) => <text className="chart-axis" key={`xt-${tick.value}`} x={tick.x} y="278" textAnchor="middle">{tick.label}</text>)}
              <text className="chart-axis chart-axis-title" x="64" y="20">Latency · ms</text>
              <text className="chart-axis chart-axis-title" x="64" y="324">Loss</text>
              {chartModel.lossBins.map((bin, index) => <rect className="chart-loss-bin" key={index} x={bin.x} y={chartBounds.heatTop} width={bin.width} height={chartBounds.heatHeight} fill={lossFill(bin.loss)} />)}
              {chartModel.series.map((series) => (
                <g key={series.id}>
                  {series.points.filter((point) => point.latency_ms > 0).map((point) => (
                    <line className="chart-jitter" key={`${series.id}-${point.updated_at}`} x1={point.x} x2={point.x} y1={point.highY} y2={point.lowY} stroke={series.color} />
                  ))}
                  <path className="chart-line" d={series.path} stroke={series.color} />
                </g>
              ))}
              {hoverPoint && (
                <g className="chart-tooltip" transform={`translate(${Math.min(hoverPoint.x + 12, 650)} ${Math.max(hoverPoint.y - 84, 42)})`}>
                  <line className="chart-hover-line" x1={hoverPoint.x - Math.min(hoverPoint.x + 12, 650)} x2={hoverPoint.x - Math.min(hoverPoint.x + 12, 650)} y1={chartBounds.top - Math.max(hoverPoint.y - 84, 42)} y2={chartBounds.bottom - Math.max(hoverPoint.y - 84, 42)} />
                  <rect width="230" height="82" rx="12" />
                  <circle cx="16" cy="18" r="5" fill={hoverPoint.color} />
                  <text x="28" y="22">{hoverPoint.seriesLabel}</text>
                  <text x="14" y="43">{formatTooltipTime(hoverPoint.time)}</text>
                  <text x="14" y="64">{hoverPoint.latency.toFixed(2)} ms · jitter ±{hoverPoint.jitter.toFixed(2)} ms · loss {hoverPoint.loss.toFixed(0)}%</text>
                </g>
              )}
              <rect className="chart-hit-area" x={chartBounds.left} y={chartBounds.top} width={chartWidth} height={chartBounds.bottom - chartBounds.top + 54} />
              {chartModel.empty && <text className="chart-empty" x="320" y="164">暂无可绘制的真实延迟点</text>}
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}
