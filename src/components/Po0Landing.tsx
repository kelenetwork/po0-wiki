import { useEffect, useMemo, useRef, useState } from 'react';
import './Po0Landing.css';
import { mockProbeSnapshot, PublicProbeSnapshot, usePublicProbeSnapshot } from './probeSnapshot';

type LiveEvent = {
  id: string;
  source: string;
  target: string;
  latency: string;
  status: 'stable' | 'warn' | 'pending';
};

function formatMs(value: number) {
  if (!value || value <= 0) return '— ms';
  return `${value.toFixed(2)} ms`;
}

function statusLabel(status: string): LiveEvent['status'] {
  if (status === 'warn' || status === 'degraded') return 'warn';
  if (status === 'pending' || status === 'offline' || status === 'down') return 'pending';
  return 'stable';
}

function deriveEvents(snapshot: PublicProbeSnapshot): LiveEvent[] {
  const sourceById = new Map(snapshot.sources.map((s) => [s.id, s]));
  const targetById = new Map(snapshot.targets.map((t) => [t.id, t]));
  return snapshot.checks.slice(0, 10).map((check, index) => {
    const source = sourceById.get(check.source_id);
    const target = targetById.get(check.target_id);
    return {
      id: `${check.id}-${index}`,
      source: source?.display_name ?? check.source_id,
      target: target?.display_name ?? check.target_id,
      latency: formatMs(check.latency_ms),
      status: statusLabel(check.status),
    };
  });
}

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

type StarPoint = { x: number; y: number; r: number; phase: number };
type StarLink = { a: number; b: number; speed: number };

function useConstellation(canvasRef: React.RefObject<HTMLCanvasElement>) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let width = canvas.clientWidth;
    let height = canvas.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let points: StarPoint[] = [];
    let links: StarLink[] = [];
    let pointer = { x: width * 0.5, y: height * 0.5, active: false };

    function resize() {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const density = Math.max(58, Math.min(110, Math.floor((width * height) / 18000)));
      points = Array.from({ length: density }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: 0.6 + Math.random() * 1.4,
        phase: Math.random() * Math.PI * 2,
      }));
      links = [];
      for (let i = 0; i < density; i += 1) {
        const partners = 1 + Math.floor(Math.random() * 2);
        for (let p = 0; p < partners; p += 1) {
          const j = (i + 1 + Math.floor(Math.random() * 4)) % density;
          links.push({ a: i, b: j, speed: 0.4 + Math.random() * 1.4 });
        }
      }
    }

    function frame(time: number) {
      ctx.clearRect(0, 0, width, height);

      // glow nebula
      const grad = ctx.createRadialGradient(width * 0.78, height * 0.18, 0, width * 0.78, height * 0.18, Math.max(width, height));
      grad.addColorStop(0, 'rgba(94, 192, 255, 0.16)');
      grad.addColorStop(0.5, 'rgba(38, 95, 167, 0.06)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // links
      for (const link of links) {
        const a = points[link.a];
        const b = points[link.b];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 240) continue;
        const alpha = Math.max(0, 1 - dist / 240) * 0.32;
        ctx.strokeStyle = `rgba(110, 196, 255, ${alpha})`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();

        // moving pulse
        const t = ((time / 1000) * link.speed) % 1;
        const px = a.x + dx * t;
        const py = a.y + dy * t;
        ctx.fillStyle = `rgba(160, 232, 255, ${alpha + 0.25})`;
        ctx.beginPath();
        ctx.arc(px, py, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }

      // pointer halo
      if (pointer.active) {
        const halo = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 220);
        halo.addColorStop(0, 'rgba(94, 192, 255, 0.18)');
        halo.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(pointer.x, pointer.y, 220, 0, Math.PI * 2);
        ctx.fill();
      }

      // nodes
      for (const point of points) {
        const twinkle = 0.55 + 0.45 * Math.sin(time / 850 + point.phase);
        ctx.fillStyle = `rgba(189, 226, 255, ${0.45 + twinkle * 0.4})`;
        ctx.beginPath();
        ctx.arc(point.x, point.y, point.r, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(frame);
    }

    function onPointer(event: PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      pointer.active = true;
    }

    function onPointerLeave() {
      pointer.active = false;
    }

    resize();
    raf = requestAnimationFrame(frame);
    window.addEventListener('resize', resize);
    canvas.addEventListener('pointermove', onPointer);
    canvas.addEventListener('pointerleave', onPointerLeave);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointermove', onPointer);
      canvas.removeEventListener('pointerleave', onPointerLeave);
    };
  }, [canvasRef]);
}

export default function Po0Landing() {
  const { snapshot, origin } = usePublicProbeSnapshot();
  const safeSnapshot = snapshot.checks.length > 0 ? snapshot : mockProbeSnapshot;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useConstellation(canvasRef);

  const onlineSources = useMemo(
    () => safeSnapshot.sources.filter((s) => s.status === 'online' || s.status === 'ok').length,
    [safeSnapshot.sources],
  );

  const okChecks = useMemo(
    () => safeSnapshot.checks.filter((c) => c.status === 'ok' || c.status === 'online'),
    [safeSnapshot.checks],
  );

  const avgLatency = useMemo(() => {
    if (!okChecks.length) return 0;
    return okChecks.reduce((sum, c) => sum + (c.latency_ms || 0), 0) / okChecks.length;
  }, [okChecks]);

  const lossSamples = useMemo(
    () => safeSnapshot.checks.filter((c) => c.loss_pct >= 0).map((c) => c.loss_pct),
    [safeSnapshot.checks],
  );

  const avgLoss = useMemo(() => {
    if (!lossSamples.length) return 0;
    return lossSamples.reduce((s, v) => s + v, 0) / lossSamples.length;
  }, [lossSamples]);

  const events = useMemo(() => deriveEvents(safeSnapshot), [safeSnapshot]);

  const [clock, setClock] = useState(nowHHMM());
  useEffect(() => {
    const timer = window.setInterval(() => setClock(nowHHMM()), 30 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="po0-landing">
      <canvas className="po0-landing__canvas" ref={canvasRef} aria-hidden="true" />
      <div className="po0-landing__hud" aria-hidden="true">
        <span><b>{clock}</b> Asia/Shanghai</span>
        <span>online <b>{onlineSources}/{safeSnapshot.sources.length}</b></span>
      </div>

      <header className="po0-landing__nav">
        <a className="po0-landing__brand" href="/">
          <i />
          <strong>Po0<span>.</span>Wiki</strong>
        </a>
        <nav>
          <a href="/guide/getting-started">Docs</a>
          <a href="/status">Status</a>
          <a href="/looking-glass">Looking Glass</a>
        </nav>
        <a className="po0-landing__console" href="/admin/sources">Console <em /></a>
      </header>

      <main className="po0-landing__main">
        <section className="po0-landing__hero">
          <p className="po0-landing__kicker">Po0 · Network Atlas</p>
          <h1>
            <span className="po0-landing__line po0-landing__line--solid">Observe the path.</span>
            <span className="po0-landing__line po0-landing__line--ghost">Network Atlas for real networks.</span>
          </h1>
          <p className="po0-landing__lead">
            Po0 把节点、线路、探测、故障记录沉淀成同一个实时入口。源节点 agent 主动出站，Hub 只派单；首页所有数据由 <code>/api/public/probes/snapshot</code> 实时供给。
          </p>
          <div className="po0-landing__actions">
            <a className="po0-landing__btn po0-landing__btn--primary" href="/status">Open Status</a>
            <a className="po0-landing__btn" href="/looking-glass">Run Looking Glass</a>
            <a className="po0-landing__btn po0-landing__btn--ghost" href="/guide/getting-started">Read Docs</a>
          </div>
          <div className="po0-landing__stats" role="list">
            <div role="listitem">
              <span>Online Agents</span>
              <strong>{onlineSources}<i>/{safeSnapshot.sources.length}</i></strong>
            </div>
            <div role="listitem">
              <span>Active Checks</span>
              <strong>{safeSnapshot.checks.length}</strong>
            </div>
            <div role="listitem">
              <span>Avg Latency</span>
              <strong>{avgLatency > 0 ? avgLatency.toFixed(2) : '—'}<i>ms</i></strong>
            </div>
            <div role="listitem">
              <span>Loss Window</span>
              <strong>{avgLoss.toFixed(2)}<i>%</i></strong>
            </div>
            <div role="listitem">
              <span>Source</span>
              <strong>{origin === 'api' ? 'Live snapshot' : 'Sample fallback'}</strong>
            </div>
          </div>
        </section>

        <section className="po0-landing__ticker" aria-label="实时事件流">
          <span>EVENT STREAM</span>
          <div>
            {events.concat(events).map((event, index) => (
              <p key={`${event.id}-${index}`}>
                <em>{nowHHMM()}</em>
                <b>{event.source}</b>
                →
                <b>{event.target}</b>
                <i>{event.latency}</i>
                <u data-status={event.status}>{event.status}</u>
              </p>
            ))}
          </div>
        </section>

        <section className="po0-landing__capabilities" aria-label="Po0 能力">
          <header>
            <span>What Po0 actually does</span>
            <h2>四块产品能力，没有一块是 PPT。</h2>
          </header>
          <div>
            <article>
              <span>01</span>
              <h3>Agent-First Probe</h3>
              <p>真实源节点主动从公网出站，Hub 只下发任务、回收结果，不代跑也不预设虚拟节点。</p>
            </article>
            <article>
              <span>02</span>
              <h3>Looking Glass Dispatch</h3>
              <p>选中在线 agent 一键执行 Ping / TCPing / MTR / Nexttrace，原始输出脱敏后回传。</p>
            </article>
            <article>
              <span>03</span>
              <h3>Public Snapshot API</h3>
              <p>对外只暴露 sources / targets / checks / series 的脱敏 JSON，连 host、端口、token 都不在响应里。</p>
            </article>
            <article>
              <span>04</span>
              <h3>Knowledge & Runbook</h3>
              <p>Rspress 文档保留可读宽度，运维手册、部署链路、故障处理流程长期可检索。</p>
            </article>
          </div>
        </section>
      </main>
    </div>
  );
}
