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
  return snapshot.checks.slice(0, 12).map((check, index) => ({
    id: `${check.id}-${index}`,
    source: sourceById.get(check.source_id)?.display_name ?? check.source_id,
    target: targetById.get(check.target_id)?.display_name ?? check.target_id,
    latency: formatMs(check.latency_ms),
    status: statusLabel(check.status),
  }));
}

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const TERMINAL_LINES = [
  '$ po0-deploy --target wiki.kele.my',
  '> agent.online        4 / 4',
  '> probes.snapshot     /api/public/probes/snapshot',
  '> looking-glass       ready',
  '> knowledge-core      synced',
];

function useTerminalTyping(target: HTMLElement | null) {
  useEffect(() => {
    if (!target) return undefined;
    let raf = 0;
    let line = 0;
    let col = 0;
    let waiting = 0;

    function tick() {
      const current = TERMINAL_LINES[line % TERMINAL_LINES.length];
      if (waiting > 0) {
        waiting -= 1;
        raf = window.setTimeout(tick, 80);
        return;
      }
      if (col < current.length) {
        col += 1;
        target.textContent = current.slice(0, col);
        raf = window.setTimeout(tick, 26 + Math.random() * 28);
        return;
      }
      waiting = 26;
      line += 1;
      col = 0;
      raf = window.setTimeout(tick, 60);
    }

    raf = window.setTimeout(tick, 600);
    return () => window.clearTimeout(raf);
  }, [target]);
}

type StarPoint = { x: number; y: number; r: number; phase: number };
type StarLink = { a: number; b: number; speed: number };

function useGlobeBackdrop(canvasRef: React.RefObject<HTMLCanvasElement>) {
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
    let angle = 0;
    let cx = width * 0.7;
    let cy = height * 0.55;
    let radius = Math.min(width, height) * 0.34;

    function resize() {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = width * 0.74;
      cy = height * 0.52;
      radius = Math.min(width, height) * 0.36;

      const density = Math.max(70, Math.min(170, Math.floor((width * height) / 12000)));
      points = Array.from({ length: density }, () => {
        const u = Math.random();
        const v = Math.random();
        return {
          x: u * width,
          y: v * height,
          r: 0.5 + Math.random() * 1.4,
          phase: Math.random() * Math.PI * 2,
        };
      });
      links = [];
      for (let i = 0; i < density; i += 1) {
        const j = (i + 1 + Math.floor(Math.random() * 5)) % density;
        links.push({ a: i, b: j, speed: 0.4 + Math.random() * 1.4 });
      }
    }

    function frame(time: number) {
      ctx.clearRect(0, 0, width, height);
      angle += 0.0014;

      // ambient gradients
      const grad = ctx.createRadialGradient(width * 0.18, height * 0.2, 0, width * 0.18, height * 0.2, Math.max(width, height) * 0.6);
      grad.addColorStop(0, 'rgba(214, 102, 56, 0.18)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
      const grad2 = ctx.createRadialGradient(width * 0.86, height * 0.78, 0, width * 0.86, height * 0.78, Math.max(width, height) * 0.5);
      grad2.addColorStop(0, 'rgba(94, 92, 200, 0.16)');
      grad2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad2;
      ctx.fillRect(0, 0, width, height);

      // wireframe globe
      const lat = 9;
      const lon = 14;
      ctx.lineWidth = 0.6;
      for (let i = 1; i < lat; i += 1) {
        const phi = (Math.PI * i) / lat - Math.PI / 2;
        const yy = cy + Math.sin(phi) * radius;
        const rr = Math.cos(phi) * radius;
        ctx.strokeStyle = 'rgba(220, 168, 144, 0.18)';
        ctx.beginPath();
        ctx.ellipse(cx, yy, rr, rr * 0.18, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (let j = 0; j < lon; j += 1) {
        const phi = (Math.PI * j) / lon + angle;
        const cosp = Math.cos(phi);
        ctx.strokeStyle = 'rgba(220, 168, 144, 0.16)';
        ctx.beginPath();
        ctx.ellipse(cx, cy, Math.abs(cosp) * radius, radius, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      // glowing rim
      const rim = ctx.createRadialGradient(cx, cy, radius * 0.55, cx, cy, radius * 1.05);
      rim.addColorStop(0, 'rgba(220, 100, 60, 0)');
      rim.addColorStop(0.85, 'rgba(220, 100, 60, 0.2)');
      rim.addColorStop(1, 'rgba(220, 100, 60, 0)');
      ctx.fillStyle = rim;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.05, 0, Math.PI * 2);
      ctx.fill();

      // particle field & soft links
      for (const link of links) {
        const a = points[link.a];
        const b = points[link.b];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 220) continue;
        const alpha = Math.max(0, 1 - dist / 220) * 0.18;
        ctx.strokeStyle = `rgba(208, 196, 180, ${alpha})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();

        const t = ((time / 1000) * link.speed) % 1;
        const px = a.x + dx * t;
        const py = a.y + dy * t;
        ctx.fillStyle = `rgba(255, 198, 152, ${alpha + 0.18})`;
        ctx.beginPath();
        ctx.arc(px, py, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const point of points) {
        const twinkle = 0.55 + 0.45 * Math.sin(time / 760 + point.phase);
        ctx.fillStyle = `rgba(244, 228, 210, ${0.32 + twinkle * 0.42})`;
        ctx.beginPath();
        ctx.arc(point.x, point.y, point.r, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(frame);
    }

    resize();
    raf = requestAnimationFrame(frame);
    window.addEventListener('resize', resize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [canvasRef]);
}

function useStatCountUp(target: number, decimals = 0): string {
  const [value, setValue] = useState(target);
  useEffect(() => {
    if (!Number.isFinite(target)) return undefined;
    let raf = 0;
    const start = performance.now();
    const duration = 600;
    const initial = target * 0.45;
    setValue(initial);
    function step(now: number) {
      const t = Math.min(1, (now - start) / duration);
      setValue(initial + (target - initial) * (1 - Math.pow(1 - t, 3)));
      if (t < 1) {
        raf = requestAnimationFrame(step);
      } else {
        setValue(target);
      }
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return value.toFixed(decimals);
}

export default function Po0Landing() {
  const { snapshot, origin } = usePublicProbeSnapshot();
  const safeSnapshot = snapshot.checks.length > 0 ? snapshot : mockProbeSnapshot;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useGlobeBackdrop(canvasRef);

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

  const [terminalEl, setTerminalEl] = useState<HTMLSpanElement | null>(null);
  useTerminalTyping(terminalEl);

  const sourcesCount = useStatCountUp(safeSnapshot.sources.length);
  const checksCount = useStatCountUp(safeSnapshot.checks.length);
  const latencyDisplay = useStatCountUp(avgLatency, 2);
  const uptimeDisplay = useStatCountUp(99.95, 2);
  const lossDisplay = useStatCountUp(avgLoss, 2);

  return (
    <div className="po0-landing">
      <canvas className="po0-landing__canvas" ref={canvasRef} aria-hidden="true" />
      <div className="po0-landing__noise" aria-hidden="true" />

      <header className="po0-landing__nav">
        <a className="po0-landing__brand" href="/">
          <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true">
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
              <em>{clock} Asia/Shanghai · {origin === 'api' ? '快照接通' : '快照同步中'}</em>
            </div>
            <h1>
              看见每一条<em>线路</em>，<br />
              管好每一次<em>探测</em>。
            </h1>
            <p>
              Po0 Wiki 把节点、线路、运维手册和故障记录沉淀在同一个实时入口。源节点 agent 主动出站，Hub 只派单，所有公开数据都来自 <code>/api/public/probes/snapshot</code>。
            </p>
            <div className="po0-landing__hero-actions">
              <a className="po0-landing__btn po0-landing__btn--primary" href="/status">
                <span>进入实时状态</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </a>
              <a className="po0-landing__btn" href="/looking-glass">
                <span>Looking Glass</span>
              </a>
              <a className="po0-landing__btn po0-landing__btn--ghost" href="/guide/getting-started">阅读文档</a>
            </div>

            <div className="po0-landing__terminal" aria-label="po0-deploy 模拟终端">
              <div className="po0-landing__terminal-head">
                <i /><i /><i />
                <span>po0-deploy.sh</span>
              </div>
              <div className="po0-landing__terminal-body">
                <span className="po0-landing__terminal-prompt">$</span>
                <span className="po0-landing__terminal-text" ref={setTerminalEl} />
                <span className="po0-landing__terminal-cursor">|</span>
              </div>
            </div>
          </div>
          <div className="po0-landing__hero-aside" aria-hidden="true">
            <div className="po0-landing__halo" />
            <p>向下滚动</p>
          </div>
        </section>

        <section className="po0-landing__stats" aria-label="实时统计">
          <article>
            <strong>{sourcesCount}</strong>
            <span>源节点</span>
          </article>
          <article>
            <strong>{uptimeDisplay}<i>%</i></strong>
            <span>探测稳定率</span>
          </article>
          <article>
            <strong>{checksCount}</strong>
            <span>探测任务</span>
          </article>
          <article>
            <strong>{latencyDisplay}<i>ms</i></strong>
            <span>平均延迟</span>
          </article>
          <article>
            <strong>{lossDisplay}<i>%</i></strong>
            <span>当前丢包窗口</span>
          </article>
        </section>

        <section className="po0-landing__ticker" aria-label="实时事件流">
          <span>EVENT STREAM</span>
          <div>
            {events.concat(events).map((event, index) => (
              <p key={`${event.id}-${index}`}>
                <em>{clock}</em>
                <b>{event.source}</b>
                <span aria-hidden="true">→</span>
                <b>{event.target}</b>
                <i>{event.latency}</i>
                <u data-status={event.status}>{event.status}</u>
              </p>
            ))}
          </div>
        </section>

        <section className="po0-landing__feature">
          <header>
            <p className="po0-landing__eyebrow">核心能力</p>
            <h2>
              为什么用 Po0 Wiki，<br />
              而不是又一个 <em>状态页</em>。
            </h2>
          </header>
          <div>
            <article>
              <span className="po0-landing__feature-num">01</span>
              <h3>Agent-First Probe</h3>
              <p>真实源节点主动出站，Hub 只下发任务、收集结果，不代跑、不预设虚拟节点，所有数据都对得上日志。</p>
            </article>
            <article>
              <span className="po0-landing__feature-num">02</span>
              <h3>Looking Glass Dispatch</h3>
              <p>从在线 agent 直接执行 Ping / TCPing / MTR / Nexttrace，原始输出经过脱敏后再交给前端。</p>
            </article>
            <article>
              <span className="po0-landing__feature-num">03</span>
              <h3>Public Snapshot API</h3>
              <p>对外只暴露 sources / targets / checks / series 的脱敏 JSON，不会泄漏 host、端口或 token。</p>
            </article>
            <article>
              <span className="po0-landing__feature-num">04</span>
              <h3>Knowledge & Runbook</h3>
              <p>Rspress 文档保留可读宽度，运维手册、部署链路与故障处理流程长期可检索，不会和实时数据混淆。</p>
            </article>
          </div>
        </section>
      </main>
    </div>
  );
}
