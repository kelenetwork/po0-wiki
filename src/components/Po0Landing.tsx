import { useEffect, useMemo, useRef, useState } from 'react';
import './Po0Landing.css';
import chinaMapSvg from '../assets/china-map.svg?raw';
import { mockProbeSnapshot, PublicProbeSnapshot, usePublicProbeSnapshot } from './probeSnapshot';

type RouteRow = {
  id: string;
  source: string;
  target: string;
  latency: string;
  raw: number;
  loss: number;
  jitter: number;
  status: 'excellent' | 'good' | 'warn' | 'pending';
  origin: 'shanghai' | 'guangzhou' | 'other';
};

const STATUS_LABEL: Record<RouteRow['status'], string> = {
  excellent: '极佳',
  good: '良好',
  warn: '波动',
  pending: '待接入',
};

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function classifyStatus(latency: number, loss: number, baseStatus: string): RouteRow['status'] {
  if (baseStatus === 'pending' || baseStatus === 'offline' || baseStatus === 'down') return 'pending';
  if (loss > 1 || baseStatus === 'warn' || baseStatus === 'degraded') return 'warn';
  if (latency > 0 && latency < 10) return 'excellent';
  if (latency > 0 && latency < 40) return 'good';
  if (latency >= 40) return 'warn';
  return 'pending';
}

function detectOrigin(name: string): RouteRow['origin'] {
  if (/上海|sha|shanghai/i.test(name)) return 'shanghai';
  if (/广州|gz|guangzhou|can/i.test(name)) return 'guangzhou';
  return 'other';
}

function deriveRoutes(snapshot: PublicProbeSnapshot): RouteRow[] {
  const sourceById = new Map(snapshot.sources.map((s) => [s.id, s]));
  const targetById = new Map(snapshot.targets.map((t) => [t.id, t]));
  return snapshot.checks.slice(0, 8).map((check, index) => {
    const source = sourceById.get(check.source_id);
    const target = targetById.get(check.target_id);
    const status = classifyStatus(check.latency_ms, check.loss_pct, check.status);
    return {
      id: `${check.id}-${index}`,
      source: source?.display_name ?? check.source_id,
      target: target?.display_name ?? check.target_id,
      latency: check.latency_ms > 0 ? `${check.latency_ms.toFixed(2)} ms` : '— ms',
      raw: check.latency_ms,
      loss: check.loss_pct,
      jitter: check.jitter_ms,
      status,
      origin: detectOrigin(source?.display_name ?? ''),
    };
  });
}

const MAP_VIEWBOX = '0 0 774 569';

const CITY_POINTS = {
  shanghai: { x: 605, y: 387, label: 'Po0 · 上海' },
  guangzhou: { x: 495, y: 533, label: 'Po0 · 广州' },
};

const TARGET_POINTS = [
  { id: 'po0-tencent', x: 545, y: 545, label: 'Po0-Tencent', anchor: 'end' as const },
  { id: 'rfc-ctc', x: 670, y: 360, label: 'RFC CTC', anchor: 'end' as const },
  { id: 'rfc-jinx', x: 615, y: 470, label: 'RFC JINX', anchor: 'end' as const },
];

export default function Po0Landing() {
  const { snapshot, origin } = usePublicProbeSnapshot();
  const safeSnapshot = snapshot.checks.length > 0 ? snapshot : mockProbeSnapshot;
  const routes = useMemo(() => deriveRoutes(safeSnapshot), [safeSnapshot]);

  const onlineSources = useMemo(
    () => safeSnapshot.sources.filter((s) => s.status === 'online' || s.status === 'ok').length,
    [safeSnapshot.sources],
  );
  const totalSources = safeSnapshot.sources.length;

  const totalChecks = safeSnapshot.checks.length;
  const okChecks = useMemo(
    () => safeSnapshot.checks.filter((c) => c.status === 'ok' || c.status === 'online'),
    [safeSnapshot.checks],
  );
  const avgLatency = useMemo(() => {
    if (!okChecks.length) return 0;
    return okChecks.reduce((sum, c) => sum + (c.latency_ms || 0), 0) / okChecks.length;
  }, [okChecks]);
  const avgLoss = useMemo(() => {
    const samples = safeSnapshot.checks.filter((c) => c.loss_pct >= 0).map((c) => c.loss_pct);
    if (!samples.length) return 0;
    return samples.reduce((s, v) => s + v, 0) / samples.length;
  }, [safeSnapshot.checks]);

  const [clock, setClock] = useState(nowHHMM());
  useEffect(() => {
    const timer = window.setInterval(() => setClock(nowHHMM()), 30 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const [activeOrigin, setActiveOrigin] = useState<'all' | 'shanghai' | 'guangzhou'>('all');
  const filteredRoutes = useMemo(() => {
    if (activeOrigin === 'all') return routes;
    return routes.filter((r) => r.origin === activeOrigin);
  }, [routes, activeOrigin]);

  const cityCounts = useMemo(() => ({
    shanghai: routes.filter((r) => r.origin === 'shanghai').length,
    guangzhou: routes.filter((r) => r.origin === 'guangzhou').length,
  }), [routes]);

  return (
    <div className="po0-landing">
      <header className="po0-landing__nav">
        <a className="po0-landing__brand" href="/">
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="1.4" />
            <circle cx="16" cy="16" r="3" fill="currentColor" />
            <path d="M16 2v28M2 16h28" stroke="currentColor" strokeWidth="0.6" opacity="0.4" />
            <ellipse cx="16" cy="16" rx="8" ry="14" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
          </svg>
          <span>Po0</span>
          <i />
          <span>Wiki</span>
        </a>
        <nav>
          <a href="/guide/getting-started">指南</a>
          <a href="/status">服务状态</a>
          <a href="/looking-glass">Looking Glass</a>
        </nav>
        <a className="po0-landing__cta" href="/admin/sources">
          <span className="po0-landing__cta-pulse" />
          打开控制台
        </a>
      </header>

      <main className="po0-landing__main">
        <section className="po0-landing__hero">
          <div className="po0-landing__hero-text">
            <div className="po0-landing__hero-badge">
              <span />
              <em>{clock} Asia/Shanghai · {onlineSources}/{totalSources} 在线</em>
            </div>
            <h1>
              看见每一条<em>线路</em>，管好每一次<em>探测</em>。
            </h1>
            <p>
              Po0 Wiki 把节点、线路、运维手册和故障记录沉淀在同一个实时入口。下方地图显示当前从 Po0 上海 / 广州 节点对外探测到的真实路径。
            </p>
            <div className="po0-landing__hero-actions">
              <a className="po0-landing__btn po0-landing__btn--primary" href="/status">
                <span>进入实时状态</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </a>
              <a className="po0-landing__btn" href="/looking-glass">Looking Glass</a>
              <a className="po0-landing__btn po0-landing__btn--ghost" href="/guide/getting-started">阅读文档</a>
            </div>
          </div>

          <aside className="po0-landing__atlas" aria-label="实时路径地图">
            <header>
              <div>
                <p className="po0-landing__atlas-kicker">实时路径 · Realtime Paths</p>
                <h2>{origin === 'api' ? '快照接通' : '快照同步中'} <i className="po0-landing__live-dot" /></h2>
              </div>
              <div className="po0-landing__atlas-tabs" role="tablist">
                <button type="button" className={activeOrigin === 'all' ? 'is-active' : ''} onClick={() => setActiveOrigin('all')}>全部</button>
                <button type="button" className={activeOrigin === 'shanghai' ? 'is-active' : ''} onClick={() => setActiveOrigin('shanghai')}>上海 · {cityCounts.shanghai}</button>
                <button type="button" className={activeOrigin === 'guangzhou' ? 'is-active' : ''} onClick={() => setActiveOrigin('guangzhou')}>广州 · {cityCounts.guangzhou}</button>
              </div>
            </header>

            <div className="po0-landing__atlas-stage">
              <div className="po0-landing__atlas-canvas">
                <div className="po0-landing__atlas-map" dangerouslySetInnerHTML={{ __html: chinaMapSvg }} />
                <svg className="po0-landing__atlas-overlay" viewBox={MAP_VIEWBOX} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                <defs>
                  <radialGradient id="po0CityGlow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="rgba(80,200,255,0.55)" />
                    <stop offset="100%" stopColor="rgba(80,200,255,0)" />
                  </radialGradient>
                </defs>
                {(activeOrigin === 'all' || activeOrigin === 'shanghai') && TARGET_POINTS.map((tgt) => (
                  <line
                    key={`sh-${tgt.id}`}
                    className="po0-landing__atlas-line"
                    x1={CITY_POINTS.shanghai.x}
                    y1={CITY_POINTS.shanghai.y}
                    x2={tgt.x}
                    y2={tgt.y}
                  />
                ))}
                {(activeOrigin === 'all' || activeOrigin === 'guangzhou') && TARGET_POINTS.map((tgt) => (
                  <line
                    key={`gz-${tgt.id}`}
                    className="po0-landing__atlas-line po0-landing__atlas-line--gz"
                    x1={CITY_POINTS.guangzhou.x}
                    y1={CITY_POINTS.guangzhou.y}
                    x2={tgt.x}
                    y2={tgt.y}
                  />
                ))}
                {TARGET_POINTS.map((tgt) => (
                  <g key={tgt.id} className="po0-landing__atlas-target">
                    <circle cx={tgt.x} cy={tgt.y} r="3.4" />
                    <text x={tgt.anchor === 'end' ? tgt.x - 8 : tgt.x + 8} y={tgt.y - 6} textAnchor={tgt.anchor}>{tgt.label}</text>
                  </g>
                ))}
                <g className={`po0-landing__atlas-city ${activeOrigin === 'shanghai' || activeOrigin === 'all' ? 'is-active' : ''}`}>
                  <circle cx={CITY_POINTS.shanghai.x} cy={CITY_POINTS.shanghai.y} r="22" fill="url(#po0CityGlow)" />
                  <circle cx={CITY_POINTS.shanghai.x} cy={CITY_POINTS.shanghai.y} r="6" />
                  <circle className="po0-landing__atlas-pulse" cx={CITY_POINTS.shanghai.x} cy={CITY_POINTS.shanghai.y} r="6" />
                  <text x={CITY_POINTS.shanghai.x - 14} y={CITY_POINTS.shanghai.y - 14} textAnchor="end">Po0 · 上海</text>
                </g>
                <g className={`po0-landing__atlas-city ${activeOrigin === 'guangzhou' || activeOrigin === 'all' ? 'is-active' : ''}`}>
                  <circle cx={CITY_POINTS.guangzhou.x} cy={CITY_POINTS.guangzhou.y} r="22" fill="url(#po0CityGlow)" />
                  <circle cx={CITY_POINTS.guangzhou.x} cy={CITY_POINTS.guangzhou.y} r="6" />
                  <circle className="po0-landing__atlas-pulse" cx={CITY_POINTS.guangzhou.x} cy={CITY_POINTS.guangzhou.y} r="6" />
                  <text x={CITY_POINTS.guangzhou.x - 14} y={CITY_POINTS.guangzhou.y + 22} textAnchor="end">Po0 · 广州</text>
                </g>
              </svg>
              </div>

              <div className="po0-landing__atlas-list" role="list">
                {filteredRoutes.length === 0 && <p className="po0-landing__atlas-empty">当前没有匹配的探测任务。</p>}
                {filteredRoutes.slice(0, 4).map((route) => (
                  <article key={route.id} role="listitem" className={`po0-landing__atlas-row po0-landing__atlas-row--${route.status}`}>
                    <span className="po0-landing__atlas-dot" />
                    <div>
                      <strong>{route.target}</strong>
                      <small>{route.source}</small>
                    </div>
                    <em>{route.latency}<u>{STATUS_LABEL[route.status]}</u></em>
                  </article>
                ))}
              </div>
            </div>

            <footer>
              <span>路径总数 <b>{totalChecks}</b></span>
              <span>在线节点 <b>{onlineSources}/{totalSources}</b></span>
              <span>平均延迟 <b>{avgLatency > 0 ? avgLatency.toFixed(2) + ' ms' : '—'}</b></span>
              <span>丢包率 <b>{avgLoss.toFixed(2)}%</b></span>
            </footer>
          </aside>
        </section>

        <section className="po0-landing__pillars" id="why-po0">
          <header>
            <p className="po0-landing__eyebrow">为什么选择 Po0</p>
            <h2>占位 · 这里之后会写为什么用 Po0。</h2>
          </header>
          <div className="po0-landing__pillars-grid">
            <article><span>01</span><p>稍后补充</p></article>
            <article><span>02</span><p>稍后补充</p></article>
            <article><span>03</span><p>稍后补充</p></article>
          </div>
        </section>

        <section className="po0-landing__pillars" id="how-to-use">
          <header>
            <p className="po0-landing__eyebrow">如何使用 Po0</p>
            <h2>占位 · 这里之后会写如何接入和使用 Po0。</h2>
          </header>
          <div className="po0-landing__pillars-grid">
            <article><span>STEP 1</span><p>稍后补充</p></article>
            <article><span>STEP 2</span><p>稍后补充</p></article>
            <article><span>STEP 3</span><p>稍后补充</p></article>
          </div>
        </section>
      </main>
    </div>
  );
}
