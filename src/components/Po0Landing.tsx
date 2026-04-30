import { useEffect, useMemo, useRef, useState } from 'react';
import './Po0Landing.css';
import chinaMapSvg from '../assets/china-map.svg?raw';
import { mockProbeSnapshot, PublicProbeSnapshot, usePublicProbeSnapshot } from './probeSnapshot';

const MAP_VIEWBOX = '0 0 774 569';

const CITY_POINTS = {
  shanghai: { x: 605, y: 387, label: 'Po0·上海' },
  guangzhou: { x: 495, y: 533, label: 'Po0·广州' },
};

const TARGET_POINTS = {
  hongkong: { x: 528, y: 540, label: '香港 HKG', anchor: 'start' as const, dx: 12, dy: 4 },
  tokyo: { x: 736, y: 314, label: '东京 NRT', anchor: 'end' as const, dx: -10, dy: -8 },
};

const HERO_LINES = ['Po0', 'Routing', 'Atlas'];
const HERO_DRIFTS = [
  '× RFC',
  '使用手册',
  '实时状态',
  'Looking Glass',
  '故障复盘',
];

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function buildPath(a: { x: number; y: number }, b: { x: number; y: number }) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const arc = Math.min(70, len * 0.22);
  const cx = mx + nx * arc;
  const cy = my + ny * arc;
  return `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;
}

function useScrollReveal() {
  useEffect(() => {
    const targets = document.querySelectorAll<HTMLElement>('.po0-reveal');
    if (typeof IntersectionObserver === 'undefined') {
      targets.forEach((node) => node.classList.add('is-visible'));
      return undefined;
    }
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      }
    }, { threshold: 0, rootMargin: '0px 0px -8% 0px' });
    targets.forEach((node) => io.observe(node));
    // Fallback: also reveal everything after the first frame so even slow / headless renders never stay blank.
    const raf = window.requestAnimationFrame(() => {
      targets.forEach((node) => {
        const rect = node.getBoundingClientRect();
        if (rect.top < window.innerHeight) node.classList.add('is-visible');
      });
    });
    const fallback = window.setTimeout(() => {
      targets.forEach((node) => node.classList.add('is-visible'));
    }, 1500);
    return () => {
      io.disconnect();
      window.cancelAnimationFrame(raf);
      window.clearTimeout(fallback);
    };
  }, []);
}

function useDriftCycle(intervalMs = 2400) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setIndex((i) => (i + 1) % HERO_DRIFTS.length), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return HERO_DRIFTS[index];
}

export default function Po0Landing() {
  const { snapshot } = usePublicProbeSnapshot();
  const safeSnapshot = snapshot.checks.length > 0 ? snapshot : mockProbeSnapshot;
  useScrollReveal();
  const drift = useDriftCycle();

  const [clock, setClock] = useState(nowHHMM());
  useEffect(() => {
    const timer = window.setInterval(() => setClock(nowHHMM()), 30 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const links = useMemo(() => ([
    { from: 'shanghai' as const, to: 'hongkong' as const, color: 'cyan' },
    { from: 'shanghai' as const, to: 'tokyo' as const, color: 'cyan' },
    { from: 'guangzhou' as const, to: 'hongkong' as const, color: 'violet' },
    { from: 'guangzhou' as const, to: 'tokyo' as const, color: 'violet' },
  ]), []);

  return (
    <div className="po0-landing">
      <header className="po0-landing__nav po0-reveal">
        <a className="po0-landing__brand" href="/">
          <svg width="34" height="34" viewBox="0 0 32 32" fill="none" aria-hidden="true">
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
        <a className="po0-landing__cta" href="/admin/sources" aria-label="打开控制台">
          <span className="po0-landing__cta-pulse" />
        </a>
      </header>

      <main className="po0-landing__main">
        <section className="po0-landing__hero">
          <div className="po0-landing__hero-text po0-reveal">
            <p className="po0-landing__hero-kicker">
              Po0 <em>×</em> RFC ·
              <span className="po0-landing__drift" key={drift}>{drift}</span>
            </p>
            <h1 className="po0-landing__hero-title">
              <span className="po0-landing__hero-word" style={{ animationDelay: '0.05s' }}>Po0</span>
              <span className="po0-landing__hero-word po0-landing__hero-word--accent" style={{ animationDelay: '0.18s' }}>Routing</span>
              <span className="po0-landing__hero-word" style={{ animationDelay: '0.32s' }}>Atlas<i className="po0-landing__hero-cursor" /></span>
            </h1>
            <p className="po0-landing__hero-sub">
              一份给自己看的 <em>使用手册</em>，一面给所有人看的 <em>实时镜面</em>。
            </p>

            <div className="po0-landing__hero-actions">
              <a className="po0-landing__btn po0-landing__btn--primary" href="/status">
                <span>进入实时状态</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </a>
              <a className="po0-landing__btn po0-landing__btn--secondary" href="/looking-glass">
                <span>Looking Glass</span>
              </a>
              <a className="po0-landing__btn po0-landing__btn--secondary" href="/guide/getting-started">
                <span>阅读文档</span>
              </a>
            </div>
            <p className="po0-landing__hero-hint" aria-hidden="true">
              <span>{clock}</span>
              <i />
              <span>scroll ↓</span>
            </p>
          </div>

          <aside className="po0-landing__atlas po0-reveal" aria-label="实时路径地图">
            <div className="po0-landing__atlas-canvas">
              <div className="po0-landing__atlas-map" dangerouslySetInnerHTML={{ __html: chinaMapSvg }} />
              <svg className="po0-landing__atlas-overlay" viewBox={MAP_VIEWBOX} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                <defs>
                  <radialGradient id="po0CityGlow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="rgba(80,200,255,0.55)" />
                    <stop offset="100%" stopColor="rgba(80,200,255,0)" />
                  </radialGradient>
                </defs>
                {links.map((link, idx) => (
                  <path
                    key={`link-${idx}`}
                    className={`po0-landing__atlas-line po0-landing__atlas-line--${link.color}`}
                    d={buildPath(CITY_POINTS[link.from], TARGET_POINTS[link.to])}
                    style={{ animationDelay: `${idx * 0.4}s` }}
                  />
                ))}
                {Object.entries(TARGET_POINTS).map(([id, tgt]) => (
                  <g key={id} className="po0-landing__atlas-target">
                    <circle cx={tgt.x} cy={tgt.y} r="3.6" />
                    <circle className="po0-landing__atlas-target-pulse" cx={tgt.x} cy={tgt.y} r="3.6" />
                    <text x={tgt.x + tgt.dx} y={tgt.y + tgt.dy} textAnchor={tgt.anchor}>{tgt.label}</text>
                  </g>
                ))}
                {(['shanghai', 'guangzhou'] as const).map((id) => {
                  const city = CITY_POINTS[id];
                  return (
                    <g key={id} className="po0-landing__atlas-city is-active">
                      <circle cx={city.x} cy={city.y} r="24" fill="url(#po0CityGlow)" />
                      <circle cx={city.x} cy={city.y} r="6" />
                      <circle className="po0-landing__atlas-pulse" cx={city.x} cy={city.y} r="6" />
                      <text x={city.x - 14} y={city.y - 16} textAnchor="end">{city.label}</text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </aside>
        </section>

        <section className="po0-landing__pillars po0-reveal" id="why-po0">
          <header>
            <p className="po0-landing__eyebrow">为什么选择 Po0</p>
            <h2>占位 · 这里之后会写为什么用 Po0。</h2>
          </header>
          <div className="po0-landing__pillars-grid">
            <article className="po0-reveal"><span>01</span><p>稍后补充</p></article>
            <article className="po0-reveal"><span>02</span><p>稍后补充</p></article>
            <article className="po0-reveal"><span>03</span><p>稍后补充</p></article>
          </div>
        </section>

        <section className="po0-landing__pillars po0-reveal" id="how-to-use">
          <header>
            <p className="po0-landing__eyebrow">如何使用 Po0</p>
            <h2>占位 · 这里之后会写如何接入和使用 Po0。</h2>
          </header>
          <div className="po0-landing__pillars-grid">
            <article className="po0-reveal"><span>STEP 1</span><p>稍后补充</p></article>
            <article className="po0-reveal"><span>STEP 2</span><p>稍后补充</p></article>
            <article className="po0-reveal"><span>STEP 3</span><p>稍后补充</p></article>
          </div>
        </section>
      </main>
    </div>
  );
}
