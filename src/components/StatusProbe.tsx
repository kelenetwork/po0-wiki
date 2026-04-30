import { type MouseEvent, useEffect, useMemo, useState } from "react";
import "./StatusProbe.css";
import {
  mockProbeSnapshot,
  PublicProbeItem,
  PublicProbePoint,
  PublicProbeSnapshot,
  PublicProbeSeries,
  usePublicProbeSnapshot,
} from "./probeSnapshot";

type ProbeStatus = "online" | "warn" | "pending" | "offline";

type TargetLatency = {
  id: string;
  sourceId: string;
  target: string;
  location: string;
  latencyValue: string;
  latencyUnit: string;
  jitter: string;
  loss: string;
  tone: "green" | "blue" | "amber" | "violet";
  pending: boolean;
};

type ChartPoint = PublicProbePoint & {
  time: number;
  x: number;
  y: number;
  lowY: number;
  highY: number;
};

type ChartSeriesStats = {
  current: number | null;
  p50: number | null;
  p95: number | null;
  avgLoss: number;
  maxLoss: number;
  avgJitter: number;
  samples: number;
};

type ChartSeries = {
  id: string;
  label: string;
  color: string;
  points: ChartPoint[];
  path: string;
  smokePath: string;
  stats: ChartSeriesStats;
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
  windowLabel: string;
  coverageLabel: string;
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

const toneCycle: TargetLatency["tone"][] = ["green", "blue", "amber", "violet"];
const chartColors = [
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ef4444",
  "#06b6d4",
  "#f97316",
  "#64748b",
];
const chartBounds = {
  left: 72,
  right: 846,
  top: 42,
  bottom: 250,
  heatTop: 294,
  heatHeight: 18,
};
const chartWidth = chartBounds.right - chartBounds.left;
const chartHeight = chartBounds.bottom - chartBounds.top;
const hourMs = 60 * 60 * 1000;
const dayMs = 24 * hourMs;
const rangeOptions = [
  { key: "1d", label: "1天", durationMs: dayMs, tickMs: 6 * hourMs },
  { key: "7d", label: "7天", durationMs: 7 * dayMs, tickMs: dayMs },
  { key: "30d", label: "30天", durationMs: 30 * dayMs, tickMs: 5 * dayMs },
] as const;
type RangeKey = (typeof rangeOptions)[number]["key"];

function safeStatus(status: string): ProbeStatus {
  if (status === "online" || status === "ok") return "online";
  if (status === "warn" || status === "degraded") return "warn";
  if (status === "offline" || status === "down") return "offline";
  return "pending";
}

function isOnline(status: string) {
  return safeStatus(status) === "online";
}

function metricValue(value: number, digits = 2) {
  return value > 0 ? value.toFixed(digits) : "待接入";
}

function lossValue(value: number) {
  return `${Math.round(value)}%`;
}

function relativeTime(value: string) {
  if (!value) return "—";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return value;
  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSeconds < 60) return "刚刚";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} 小时前`;
  return `${Math.floor(diffHours / 24)} 天前`;
}

function formatTimeLabel(value: string | number, rangeKey: RangeKey) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  if (rangeKey === "1d") {
    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return date.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  });
}

function formatTooltipTime(value: number) {
  const date = new Date(value);
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function findName(
  snapshot: PublicProbeSnapshot,
  kind: "sources" | "targets",
  id: string,
) {
  return snapshot[kind].find((item) => item.id === id)?.display_name ?? id;
}

function compactRouteLabel(label: string) {
  return label
    .replace(/[🇦-🇿]/gu, "")
    .replace(/Po0上海/g, "上海")
    .replace(/Po0广州/g, "广州")
    .replace(/腾讯云T1香港/g, "T1香港")
    .replace(/腾讯云T1美国/g, "T1美国")
    .replace(/Po0-Tencent/g, "Po0-T")
    .replace(/RFC JP JINX/g, "JP JINX")
    .replace(/RFC /g, "")
    .replace(/\s*→\s*/g, " → ")
    .replace(/\s+/g, " ")
    .trim();
}

function colorForSeries(snapshot: PublicProbeSnapshot, checkId: string) {
  const index = Math.max(
    0,
    snapshot.series.findIndex((series) => series.check_id === checkId),
  );
  return chartColors[index % chartColors.length];
}

function toLatencyCards(snapshot: PublicProbeSnapshot): TargetLatency[] {
  return snapshot.checks.map((check, index) => {
    const pending = check.latency_ms <= 0 && check.loss_pct >= 100;
    return {
      id: check.id,
      sourceId: check.source_id,
      target: findName(snapshot, "targets", check.target_id),
      location:
        check.display_name ||
        `${findName(snapshot, "sources", check.source_id)} → ${findName(snapshot, "targets", check.target_id)}`,
      latencyValue: metricValue(check.latency_ms),
      latencyUnit: check.latency_ms > 0 ? "ms" : "",
      jitter: check.jitter_ms > 0 ? `±${check.jitter_ms.toFixed(2)} ms` : "—",
      loss: lossValue(check.loss_pct),
      tone: pending
        ? "amber"
        : check.status === "warn"
          ? "amber"
          : toneCycle[index % toneCycle.length],
      pending,
    };
  });
}

function pointTime(point: PublicProbePoint) {
  const time = new Date(point.updated_at).getTime();
  return Number.isFinite(time) ? time : NaN;
}

function isBrokenPoint(
  point: Pick<PublicProbePoint, "latency_ms" | "loss_pct">,
) {
  return point.latency_ms <= 0 || point.loss_pct >= 100;
}

function splitGoodSegments(points: ChartPoint[]) {
  const segments: ChartPoint[][] = [];
  let current: ChartPoint[] = [];
  points.forEach((point) => {
    if (isBrokenPoint(point)) {
      if (current.length > 1) segments.push(current);
      current = [];
      return;
    }
    current.push(point);
  });
  if (current.length > 1) segments.push(current);
  return segments;
}

function simplifyChartPoints(points: ChartPoint[]) {
  if (points.length <= 180) return points;
  const simplified: ChartPoint[] = [];
  let lastKept: ChartPoint | null = null;
  points.forEach((point, index) => {
    const previous = points[index - 1];
    const next = points[index + 1];
    const brokenBoundary =
      isBrokenPoint(point) ||
      (previous && isBrokenPoint(previous)) ||
      (next && isBrokenPoint(next));
    if (index === 0 || index === points.length - 1 || brokenBoundary) {
      simplified.push(point);
      lastKept = point;
      return;
    }
    if (
      !lastKept ||
      point.x - lastKept.x >= 3.2 ||
      Math.abs(point.latency_ms - lastKept.latency_ms) >= 1.4 ||
      point.loss_pct > 0
    ) {
      simplified.push(point);
      lastKept = point;
    }
  });
  return simplified;
}

function buildPath(points: ChartPoint[]) {
  return splitGoodSegments(points)
    .map((segment) => {
      if (segment.length < 3) {
        return segment
          .map(
            (point, index) =>
              `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
          )
          .join(" ");
      }
      const commands = [
        `M${segment[0].x.toFixed(1)} ${segment[0].y.toFixed(1)}`,
      ];
      for (let index = 1; index < segment.length - 1; index += 1) {
        const current = segment[index];
        const next = segment[index + 1];
        const midX = (current.x + next.x) / 2;
        const midY = (current.y + next.y) / 2;
        commands.push(
          `Q${current.x.toFixed(1)} ${current.y.toFixed(1)} ${midX.toFixed(1)} ${midY.toFixed(1)}`,
        );
      }
      const last = segment[segment.length - 1];
      commands.push(`L${last.x.toFixed(1)} ${last.y.toFixed(1)}`);
      return commands.join(" ");
    })
    .join(" ");
}

function buildSmokePath(points: ChartPoint[]) {
  return splitGoodSegments(points)
    .map((segment) => {
      const upper = segment.map(
        (point, index) =>
          `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.highY.toFixed(1)}`,
      );
      const lower = [...segment]
        .reverse()
        .map((point) => `L${point.x.toFixed(1)} ${point.lowY.toFixed(1)}`);
      return `${upper.join(" ")} ${lower.join(" ")} Z`;
    })
    .join(" ");
}

function percentile(values: number[], ratio: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * ratio;
  const base = Math.floor(position);
  const rest = position - base;
  const next = sorted[base + 1];
  return next === undefined
    ? sorted[base]
    : sorted[base] + rest * (next - sorted[base]);
}

function average(values: number[]) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function chartSeriesStats(points: ChartPoint[]): ChartSeriesStats {
  const usable = points.filter(
    (point) => point.latency_ms > 0 && point.loss_pct < 100,
  );
  const latencies = usable.map((point) => point.latency_ms);
  return {
    current: usable.at(-1)?.latency_ms ?? null,
    p50: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
    avgLoss: average(points.map((point) => point.loss_pct)),
    maxLoss: points.length
      ? Math.max(...points.map((point) => point.loss_pct))
      : 0,
    avgJitter: average(usable.map((point) => point.jitter_ms)),
    samples: usable.length,
  };
}

function formatMs(value: number | null, digits = 1) {
  return value == null ? "—" : `${value.toFixed(digits)}ms`;
}

function niceStep(rawStep: number) {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(rawStep, 1)));
  const normalized = rawStep / magnitude;
  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

function buildChartModel(
  snapshot: PublicProbeSnapshot,
  selectedIds: string[],
  rangeKey: RangeKey,
): ChartModel {
  const checksById = new Map(snapshot.checks.map((check) => [check.id, check]));
  const visibleSeries = snapshot.series.filter((series) =>
    selectedIds.includes(series.check_id),
  );
  const allTimedPoints = visibleSeries.flatMap((series) =>
    series.points
      .map((point) => ({ ...point, time: pointTime(point) }))
      .filter((point) => Number.isFinite(point.time)),
  );
  const maxObservedTime = allTimedPoints.length
    ? Math.max(...allTimedPoints.map((point) => point.time))
    : Date.now();
  const range =
    rangeOptions.find((item) => item.key === rangeKey) ?? rangeOptions[0];
  const minTime = maxObservedTime - range.durationMs;
  const maxTime = maxObservedTime;
  const visiblePoints = allTimedPoints.filter(
    (point) => point.time >= minTime && point.time <= maxTime,
  );
  const usablePoints = visiblePoints.filter(
    (point) => point.latency_ms > 0 && point.loss_pct < 100,
  );
  const lowValues = usablePoints.map((point) =>
    Math.max(0, point.latency_ms - Math.max(point.jitter_ms, 1)),
  );
  const highValues = usablePoints.map(
    (point) => point.latency_ms + Math.max(point.jitter_ms, 1),
  );
  const minLatency = lowValues.length ? Math.min(...lowValues) : 0;
  const maxLatency = highValues.length ? Math.max(...highValues) : 100;
  // Do not let one-off timeout spikes flatten the whole chart. SmokePing-style
  // pages usually keep the normal band readable and let the loss strip show breaks.
  const readableMax = Math.max(
    percentile(highValues, 0.985) ?? maxLatency,
    (percentile(
      usablePoints.map((point) => point.latency_ms),
      0.95,
    ) ?? 0) +
      Math.max(
        6,
        (percentile(
          usablePoints.map((point) => point.jitter_ms),
          0.95,
        ) ?? 0) * 2,
      ),
  );
  const yStep = niceStep((readableMax - minLatency || 100) / 4);
  const yMin = Math.max(0, Math.floor(minLatency / yStep) * yStep);
  const yMax = Math.max(
    yMin + yStep * 4,
    Math.ceil(readableMax / yStep) * yStep,
  );
  const xForTime = (time: number) =>
    chartBounds.left + ((time - minTime) / range.durationMs) * chartWidth;
  const yForLatency = (latency: number) =>
    chartBounds.bottom -
    ((Math.min(latency, yMax) - yMin) / (yMax - yMin)) * chartHeight;
  const xTicks: ChartTick[] = [];
  const firstTick = Math.ceil(minTime / range.tickMs) * range.tickMs;
  for (let tick = firstTick; tick <= maxTime + 1; tick += range.tickMs) {
    xTicks.push({
      value: tick,
      label: formatTimeLabel(tick, rangeKey),
      x: xForTime(tick),
    });
  }
  const yTicks: ChartTick[] = [];
  for (let tick = yMin; tick <= yMax + yStep / 2; tick += yStep) {
    yTicks.push({
      value: tick,
      label: `${Math.round(tick)}`,
      y: yForLatency(tick),
    });
  }
  const series = visibleSeries.map((rawSeries) => {
    const label =
      checksById.get(rawSeries.check_id)?.display_name || rawSeries.check_id;
    const fullPoints = rawSeries.points
      .map((point) => ({ ...point, time: pointTime(point) }))
      .filter(
        (point) =>
          Number.isFinite(point.time) &&
          point.time >= minTime &&
          point.time <= maxTime,
      )
      .map((point) => ({
        ...point,
        x: xForTime(point.time),
        y: yForLatency(point.latency_ms),
        lowY: yForLatency(
          Math.max(0, point.latency_ms - Math.max(point.jitter_ms, 1)),
        ),
        highY: yForLatency(point.latency_ms + Math.max(point.jitter_ms, 1)),
      }));
    const points = simplifyChartPoints(fullPoints);
    return {
      id: rawSeries.check_id,
      label,
      color: colorForSeries(snapshot, rawSeries.check_id),
      points,
      path: buildPath(points),
      smokePath: buildSmokePath(points),
      stats: chartSeriesStats(fullPoints),
    };
  });
  const binCount = 72;
  const binWidth = chartWidth / binCount;
  const lossBins = Array.from({ length: binCount }, (_, index) => {
    const start = minTime + (range.durationMs / binCount) * index;
    const end = start + range.durationMs / binCount;
    const points = visiblePoints.filter(
      (point) => point.time >= start && point.time < end,
    );
    const loss = points.length
      ? Math.max(...points.map((point) => point.loss_pct))
      : 0;
    return {
      x: chartBounds.left + index * binWidth,
      width: Math.max(1, binWidth - 1),
      loss,
    };
  });
  const allHistoryTimes = allTimedPoints.map((point) => point.time);
  const historyStart = allHistoryTimes.length
    ? Math.min(...allHistoryTimes)
    : maxObservedTime;
  const availableMs = Math.max(0, maxObservedTime - historyStart);
  const coveredMs = Math.min(range.durationMs, availableMs);
  const coverageLabel =
    availableMs + hourMs < range.durationMs
      ? `当前仅有约 ${Math.max(1, Math.ceil(coveredMs / hourMs))} 小时历史，${range.label} 会随数据累积自动铺满`
      : `显示最近 ${range.label}`;
  return {
    series,
    xTicks,
    yTicks,
    lossBins,
    empty: usablePoints.length === 0,
    windowLabel: range.label,
    coverageLabel,
  };
}

function seriesIdsForSource(snapshot: PublicProbeSnapshot, sourceId: string) {
  const checkIds = new Set(
    snapshot.checks
      .filter((check) => sourceId === "all" || check.source_id === sourceId)
      .map((check) => check.id),
  );
  return snapshot.series
    .filter(
      (item) =>
        checkIds.has(item.check_id) &&
        item.points.some(
          (point) => point.latency_ms > 0 && point.loss_pct < 100,
        ),
    )
    .map((item) => item.check_id);
}

function defaultSelectedSeries(
  snapshot: PublicProbeSnapshot,
  sourceId = "all",
) {
  const scoped = seriesIdsForSource(snapshot, sourceId);
  if (sourceId !== "all") return scoped.slice(0, 4);
  return scoped.slice(0, 3);
}

function defaultSourceId(sources: PublicProbeItem[]) {
  return (
    sources.find((source) => isOnline(source.status))?.id ??
    sources[0]?.id ??
    "all"
  );
}

function lossFill(loss: number) {
  if (loss <= 0) return "rgba(34, 197, 94, 0.32)";
  if (loss < 1) return "rgba(132, 204, 22, 0.46)";
  if (loss < 5) return "rgba(245, 158, 11, 0.56)";
  const opacity = Math.min(0.88, 0.32 + loss / 120);
  return `rgba(239, 68, 68, ${opacity.toFixed(2)})`;
}

export default function StatusProbe({ compact = false }: StatusProbeProps) {
  const { snapshot, origin } = usePublicProbeSnapshot();
  const safeSnapshot =
    snapshot.checks.length > 0 ? snapshot : mockProbeSnapshot;
  const targetLatencies = toLatencyCards(safeSnapshot);
  const compactTargets = targetLatencies.slice(0, 3);
  const [selectedSourceId, setSelectedSourceId] = useState(
    defaultSourceId(safeSnapshot.sources),
  );
  const [selectedSeriesIds, setSelectedSeriesIds] = useState<string[]>(
    defaultSelectedSeries(safeSnapshot, defaultSourceId(safeSnapshot.sources)),
  );
  const [selectedRange, setSelectedRange] = useState<RangeKey>("1d");
  const [hoverPoint, setHoverPoint] = useState<HoverPoint | null>(null);

  useEffect(() => {
    const nextSource = defaultSourceId(safeSnapshot.sources);
    setSelectedSourceId(nextSource);
    setSelectedSeriesIds(defaultSelectedSeries(safeSnapshot, nextSource));
  }, [safeSnapshot]);

  const filteredLatencies =
    selectedSourceId === "all"
      ? targetLatencies
      : targetLatencies.filter((item) => item.sourceId === selectedSourceId);
  const chartModel = useMemo(
    () => buildChartModel(safeSnapshot, selectedSeriesIds, selectedRange),
    [safeSnapshot, selectedSeriesIds, selectedRange],
  );
  const selectedSource = safeSnapshot.sources.find(
    (source) => source.id === selectedSourceId,
  );
  const visibleSeriesIds = seriesIdsForSource(safeSnapshot, selectedSourceId);
  const allSeriesSelected =
    visibleSeriesIds.length > 0 &&
    visibleSeriesIds.every((id) => selectedSeriesIds.includes(id));

  function selectSource(sourceId: string) {
    setSelectedSourceId(sourceId);
    setSelectedSeriesIds(defaultSelectedSeries(safeSnapshot, sourceId));
  }

  function toggleAllSeries() {
    setSelectedSeriesIds(allSeriesSelected ? [] : visibleSeriesIds);
  }

  function toggleSeries(checkId: string) {
    setSelectedSeriesIds((current) =>
      current.includes(checkId)
        ? current.filter((id) => id !== checkId)
        : [...current, checkId],
    );
  }

  function handleChartMove(event: MouseEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 900;
    const y = ((event.clientY - bounds.top) / bounds.height) * 360;
    const candidates = chartModel.series.flatMap((series) =>
      series.points
        .filter((point) => point.latency_ms > 0)
        .map((point) => ({
          series,
          point,
          distance: Math.hypot((point.x - x) * 0.9, (point.y - y) * 0.45),
        })),
    );
    const nearest = candidates.sort((a, b) => a.distance - b.distance)[0];
    if (!nearest || nearest.distance > 34) {
      setHoverPoint(null);
      return;
    }
    setHoverPoint({
      x: nearest.point.x,
      y: nearest.point.y,
      seriesLabel: compactRouteLabel(nearest.series.label),
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
          <span className="status-pill">
            {origin === "api" ? "Live" : "Syncing"}
          </span>
        </div>
        <div className="probe-list">
          {compactTargets.map((probe) => (
            <div className="probe-row" key={probe.id}>
              <span
                className={`dot ${probe.pending ? "pending" : probe.tone === "amber" ? "warn" : "online"}`}
              />
              <div>
                <strong>{probe.target}</strong>
                <small>{probe.location}</small>
              </div>
              <em>
                {probe.latencyValue}
                {probe.latencyUnit && (
                  <span className="unit"> {probe.latencyUnit}</span>
                )}
              </em>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section
      className="status-probe status-dashboard kele-status"
      aria-label="链路状态"
    >
      <div className="status-dashboard__topbar">
        <div>
          <span className="status-source-meta">
            {origin === "api" ? "实时状态已更新" : "正在同步状态"}
          </span>
        </div>
        <div className="status-tabs" aria-label="时间范围">
          {rangeOptions.map((range) => (
            <button
              type="button"
              className={selectedRange === range.key ? "active" : ""}
              key={range.key}
              onClick={() => setSelectedRange(range.key)}
            >
              {range.label}
            </button>
          ))}
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
                      <small>
                        {node.region} · {node.tags.join(" / ") || "public"}
                      </small>
                    </div>
                  </div>
                  <div className="source-node-card__meta">
                    <span className={`node-status node-status--${status}`}>
                      <i />
                      {status}
                    </span>
                    <span title={node.updated_at}>
                      更新于 {relativeTime(node.updated_at)}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </aside>

        <div className="status-main-panel">
          <div className="source-filter" aria-label="源节点筛选">
            <button
              type="button"
              className={selectedSourceId === "all" ? "active" : ""}
              onClick={() => selectSource("all")}
            >
              全部
            </button>
            {safeSnapshot.sources.map((source) => (
              <button
                type="button"
                className={selectedSourceId === source.id ? "active" : ""}
                key={source.id}
                onClick={() => selectSource(source.id)}
              >
                <span className={`dot ${safeStatus(source.status)}`} />
                {source.display_name}
              </button>
            ))}
          </div>

          <div className="latency-grid" aria-label="目标延迟卡片">
            {filteredLatencies.map((item) => (
              <article
                className={`latency-card latency-card--${item.tone}${item.pending ? " latency-card--pending" : ""}`}
                key={item.id}
              >
                <span className="latency-card__route">{item.location}</span>
                <strong className="latency-card__value">
                  <span>{item.latencyValue}</span>
                  {item.latencyUnit && (
                    <span className="unit">{item.latencyUnit}</span>
                  )}
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
                <small>
                  {selectedSource
                    ? `跟随源节点：${selectedSource.display_name}`
                    : "默认展示在线线路"}{" "}
                  · {chartModel.coverageLabel} · 绿色为正常，红色为丢包
                </small>
              </div>
              <div className="status-legend" aria-label="线路图例">
                <button
                  type="button"
                  className={allSeriesSelected ? "active" : ""}
                  onClick={toggleAllSeries}
                >
                  全选
                </button>
                {safeSnapshot.series
                  .filter((series) =>
                    visibleSeriesIds.includes(series.check_id),
                  )
                  .map((series) => {
                    const check = safeSnapshot.checks.find(
                      (item) => item.id === series.check_id,
                    );
                    const active = selectedSeriesIds.includes(series.check_id);
                    const rendered = chartModel.series.find(
                      (item) => item.id === series.check_id,
                    );
                    return (
                      <button
                        type="button"
                        className={active ? "active" : ""}
                        key={series.check_id}
                        onClick={() => toggleSeries(series.check_id)}
                      >
                        <i
                          style={{
                            background: colorForSeries(
                              safeSnapshot,
                              series.check_id,
                            ),
                          }}
                        />
                        <span className="legend-label">
                          {compactRouteLabel(
                            check?.display_name || series.check_id,
                          )}
                        </span>
                        <strong>
                          {formatMs(
                            rendered?.stats.current ??
                              (check?.latency_ms && check.latency_ms > 0
                                ? check.latency_ms
                                : null),
                          )}
                        </strong>
                        <small>
                          p95 {formatMs(rendered?.stats.p95 ?? null)} · avg loss{" "}
                          {(
                            rendered?.stats.avgLoss ??
                            check?.loss_pct ??
                            0
                          ).toFixed(1)}
                          %
                        </small>
                      </button>
                    );
                  })}
              </div>
            </div>
            <svg
              className="latency-chart"
              viewBox="0 0 900 360"
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label="SmokePing 风格 24h 延迟轨迹"
              onMouseMove={handleChartMove}
              onMouseLeave={() => setHoverPoint(null)}
            >
              <defs>
                <linearGradient id="lossHeat" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0" stopColor="rgba(148, 163, 184, 0.18)" />
                  <stop offset="0.55" stopColor="rgba(245, 158, 11, 0.4)" />
                  <stop offset="1" stopColor="rgba(239, 68, 68, 0.8)" />
                </linearGradient>
              </defs>
              <rect
                className="chart-plot-bg"
                x={chartBounds.left}
                y={chartBounds.top}
                width={chartWidth}
                height={chartHeight}
                rx="14"
              />
              {chartModel.yTicks.map((tick) => (
                <line
                  className="chart-grid"
                  key={`y-${tick.value}`}
                  x1={chartBounds.left}
                  x2={chartBounds.right}
                  y1={tick.y}
                  y2={tick.y}
                />
              ))}
              {chartModel.xTicks.map((tick) => (
                <line
                  className="chart-grid chart-grid--vertical"
                  key={`x-${tick.value}`}
                  x1={tick.x}
                  x2={tick.x}
                  y1={chartBounds.top}
                  y2={chartBounds.bottom}
                />
              ))}
              {chartModel.yTicks.map((tick) => (
                <text
                  className="chart-axis"
                  key={`yt-${tick.value}`}
                  x="54"
                  y={(tick.y ?? 0) + 4}
                  textAnchor="end"
                >
                  {tick.label}
                </text>
              ))}
              {chartModel.xTicks.map((tick) => (
                <text
                  className="chart-axis"
                  key={`xt-${tick.value}`}
                  x={tick.x}
                  y="278"
                  textAnchor="middle"
                >
                  {tick.label}
                </text>
              ))}
              <text className="chart-axis chart-axis-title" x="64" y="20">
                Latency · ms
              </text>
              <text className="chart-axis chart-axis-title" x="64" y="324">
                Loss
              </text>
              {chartModel.lossBins.map((bin, index) => (
                <rect
                  className="chart-loss-bin"
                  key={index}
                  x={bin.x}
                  y={chartBounds.heatTop}
                  width={bin.width}
                  height={chartBounds.heatHeight}
                  fill={lossFill(bin.loss)}
                />
              ))}
              <text
                className="chart-axis chart-loss-label"
                x={chartBounds.right}
                y={chartBounds.heatTop + 34}
                textAnchor="end"
              >
                0% · clean / red · loss spike
              </text>
              {chartModel.series.map((series) => (
                <g key={series.id}>
                  <path
                    className="chart-smoke"
                    d={series.smokePath}
                    fill={series.color}
                  />
                  <path className="chart-line-underlay" d={series.path} />
                  <path
                    className="chart-line"
                    d={series.path}
                    stroke={series.color}
                  />
                  {series.points.length > 0 && (
                    <circle
                      className="chart-last-point"
                      cx={series.points.at(-1)?.x}
                      cy={series.points.at(-1)?.y}
                      r="3.8"
                      fill={series.color}
                    />
                  )}
                </g>
              ))}
              {hoverPoint && (
                <g
                  className="chart-tooltip"
                  transform={`translate(${Math.min(hoverPoint.x + 10, 710)} ${Math.max(hoverPoint.y - 58, 48)})`}
                >
                  <line
                    className="chart-hover-line"
                    x1={hoverPoint.x - Math.min(hoverPoint.x + 10, 710)}
                    x2={hoverPoint.x - Math.min(hoverPoint.x + 10, 710)}
                    y1={chartBounds.top - Math.max(hoverPoint.y - 58, 48)}
                    y2={chartBounds.bottom - Math.max(hoverPoint.y - 58, 48)}
                  />
                  <rect width="168" height="56" rx="10" />
                  <circle cx="13" cy="15" r="4" fill={hoverPoint.color} />
                  <text x="23" y="18">
                    {hoverPoint.seriesLabel}
                  </text>
                  <text x="14" y="43">
                    {formatTooltipTime(hoverPoint.time)}
                  </text>
                  <text x="14" y="64">
                    {hoverPoint.latency.toFixed(2)} ms · jitter ±
                    {hoverPoint.jitter.toFixed(2)} ms · loss{" "}
                    {hoverPoint.loss.toFixed(1)}%
                  </text>
                </g>
              )}
              <rect
                className="chart-hit-area"
                x={chartBounds.left}
                y={chartBounds.top}
                width={chartWidth}
                height={
                  chartBounds.heatTop +
                  chartBounds.heatHeight -
                  chartBounds.top +
                  22
                }
              />
              {chartModel.empty && (
                <text className="chart-empty" x="320" y="164">
                  暂无可绘制的真实延迟点
                </text>
              )}
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}
