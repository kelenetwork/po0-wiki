import { useEffect, useMemo, useState } from 'react';
import './Po0Landing.css';
import chinaMapSvg from '../assets/china-map.svg?raw';
import AgentDocCard from './AgentDocCard';
import { mockProbeSnapshot, PublicProbeSnapshot, usePublicProbeSnapshot } from './probeSnapshot';

const MAP_VIEWBOX = '0 0 1000 738';

const CITY_POINTS = {
  shanghai: { x: 756, y: 489.5, label: 'Po0·上海' },
  guangzhou: { x: 643.5, y: 614.2, label: 'Po0·广州' },
};

const TARGET_POINTS = {
  hongkong: { x: 648.4, y: 637.9, label: '香港 HKG', anchor: 'start' as const, dx: 14, dy: 8 },
  tokyo: { x: 925.3, y: 394.9, label: '东京 NRT', anchor: 'end' as const, dx: -10, dy: -8 },
};

const HERO_LINES = ['Po0', 'Routing', 'Atlas'];
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

function useReveal() {
  useEffect(() => {
    const targets = Array.from(document.querySelectorAll<HTMLElement>('.po0-reveal'));
    targets.forEach((node, index) => {
      node.dataset.reveal = '';
      node.style.setProperty('--reveal-delay', `${Math.min(index % 6, 5) * 80}ms`);
    });

    const reveal = (node: HTMLElement) => {
      node.dataset.revealed = 'true';
      node.classList.add('is-revealed');
    };

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      targets.forEach(reveal);
      return undefined;
    }

    if (typeof IntersectionObserver === 'undefined') {
      targets.forEach(reveal);
      return undefined;
    }

    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          reveal(entry.target as HTMLElement);
          io.unobserve(entry.target);
        }
      }
    }, { threshold: 0, rootMargin: '0px 0px -10% 0px' });

    targets.forEach((node) => io.observe(node));

    return () => {
      io.disconnect();
    };
  }, []);
}

export default function Po0Landing() {
  const { snapshot } = usePublicProbeSnapshot();
  const safeSnapshot = snapshot.checks.length > 0 ? snapshot : mockProbeSnapshot;
  useReveal();

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
              Po0 <em>×</em> RFC
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
              <a className="po0-landing__btn po0-landing__btn--secondary" href="/guide/buying/status-and-looking-glass">
                <span>购买前测试</span>
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
                {links.map((link, idx) => {
                  const source = CITY_POINTS[link.from];
                  const target = TARGET_POINTS[link.to];
                  const path = buildPath(source, target);
                  return (
                    <g key={`link-${idx}`} className={`po0-landing__atlas-link po0-landing__atlas-link--${link.color}`}>
                      <path className="po0-landing__atlas-line po0-landing__atlas-line--base" d={path} />
                      <path
                        className="po0-landing__atlas-line po0-landing__atlas-line--flow"
                        d={path}
                        style={{ animationDelay: `${idx * 0.34}s` }}
                      />
                    </g>
                  );
                })}
                {(['shanghai', 'guangzhou'] as const).map((id) => {
                  const city = CITY_POINTS[id];
                  return (
                    <g key={id} className="po0-landing__atlas-city po0-landing__atlas-city--source is-active">
                      <circle cx={city.x} cy={city.y} r="24" fill="url(#po0CityGlow)" />
                      <circle className="po0-landing__atlas-node-ring" cx={city.x} cy={city.y} r="10" />
                      <circle className="po0-landing__atlas-node-core" cx={city.x} cy={city.y} r="5.8" />
                      <circle className="po0-landing__atlas-pulse" cx={city.x} cy={city.y} r="6" />
                      <g className="po0-landing__atlas-reticle" transform={`translate(${city.x - 8} ${city.y - 8})`}>
                        <path d="M8 0 9.8 3.6H6.2Z" />
                        <path d="M8 16 6.2 12.4h3.6Z" />
                        <path d="M0 8 3.6 6.2v3.6Z" />
                        <path d="M16 8 12.4 9.8V6.2Z" />
                      </g>
                      <text x={city.x - 14} y={city.y - 16} textAnchor="end">{city.label}</text>
                    </g>
                  );
                })}
                {Object.entries(TARGET_POINTS).map(([id, tgt]) => (
                  <g key={id} className="po0-landing__atlas-target po0-landing__atlas-city--target">
                    <circle className="po0-landing__atlas-target-halo" cx={tgt.x} cy={tgt.y} r="15" />
                    <circle className="po0-landing__atlas-node-core" cx={tgt.x} cy={tgt.y} r="3.8" />
                    <circle className="po0-landing__atlas-target-pulse" cx={tgt.x} cy={tgt.y} r="3.6" />
                    <g className="po0-landing__atlas-reticle po0-landing__atlas-reticle--target" transform={`translate(${tgt.x - 8} ${tgt.y - 8})`}>
                      <path d="M8 0 9.8 3.6H6.2Z" />
                      <path d="M8 16 6.2 12.4h3.6Z" />
                      <path d="M0 8 3.6 6.2v3.6Z" />
                      <path d="M16 8 12.4 9.8V6.2Z" />
                    </g>
                    <text x={tgt.x + tgt.dx} y={tgt.y + tgt.dy} textAnchor={tgt.anchor}>{tgt.label}</text>
                  </g>
                ))}
              </svg>
            </div>
          </aside>
        </section>

        <section className="po0-landing__why po0-reveal" id="why-po0">
          <header>
            <p className="po0-landing__eyebrow">为什么推荐购买</p>
            <h2>用一份订阅，<em>买下两件事</em>。</h2>
            <p className="po0-landing__why-lead">不是简单转售机房。Po0 把企业级网络入口和廉价境外落地节点串成一条线，让你拿一台 RFC 的钱，吃到接近腾讯云一档的体验。</p>
          </header>
          <div className="po0-landing__why-grid">
            <article className="po0-landing__why-card po0-reveal">
              <span className="po0-landing__why-num">01</span>
              <div className="po0-landing__why-icon" aria-hidden="true">
                <svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M24 4 6 12v12c0 11 8 18 18 20 10-2 18-9 18-20V12L24 4Z" />
                  <path d="m17 24 5 5 9-10" />
                </svg>
              </div>
              <h3>企业级稳定性</h3>
              <p>享受与腾讯云同等级别的 SLA 保障 —— 高可用、低延迟的入口前置架构，让你的业务拥有坚如磐石的网络基础，告别频繁掉线和不稳定的烦恼。</p>
              <ul className="po0-landing__why-tags">
                <li>SLA 99.9%</li>
                <li>BGP 入口</li>
                <li>低抖动</li>
              </ul>
            </article>
            <article className="po0-landing__why-card po0-reveal">
              <span className="po0-landing__why-num">02</span>
              <div className="po0-landing__why-icon" aria-hidden="true">
                <svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="24" cy="24" r="18" />
                  <path d="M16 28c2 2 6 3 8 3s6-1 6-4-3-3-6-3-6 0-6-3 3-4 6-4 6 1 8 3" />
                  <path d="M24 8v4M24 36v4" />
                </svg>
              </div>
              <h3>大幅节省成本</h3>
              <p>有 <em>🇯🇵 日本 / 🇭🇰 香港 / 🇺🇸 美国</em> 方向的网络需求？无需再花高价买 IX 产品，仅需购买市场上流通的 RFC 廉价落地鸡即可满足。一步到位，覆盖核心线路，省下的不止一笔小钱。</p>
              <ul className="po0-landing__why-tags">
                <li>RFC 落地</li>
                <li>覆盖 JP / HK / US</li>
                <li>免 IX 溢价</li>
              </ul>
            </article>
          </div>
        </section>

        <section className="po0-landing__how po0-reveal" id="how-to-use">
          <div className="po0-landing__how-orbit" aria-hidden="true">
            <span /><span /><span />
          </div>
          <header>
            <p className="po0-landing__eyebrow">如何接入和使用 Po0</p>
            <h2>三步上手，<em>剩下交给文档</em>。</h2>
            <p className="po0-landing__how-lead">不想在首页堆 README，下面是一条最短路径，每一步都有详细文档。点开就走。</p>
          </header>

          <div className="po0-landing__how-track">
            <a className="po0-landing__how-step po0-reveal" href="/guide/buying/choose-entry-region">
              <span className="po0-landing__how-step-num">01</span>
              <span className="po0-landing__how-step-flag">START</span>
              <h3>选择 Po0 入口</h3>
              <p>先判断广州、华东、香港、美国哪类入口更适合你的使用地区和目标方向。</p>
              <em>查看入口选择 <i>↗</i></em>
            </a>
            <a className="po0-landing__how-step po0-reveal" href="/guide/tutorials/nftables-script">
              <span className="po0-landing__how-step-num">02</span>
              <span className="po0-landing__how-step-flag">RELAY</span>
              <h3>配置端口转发</h3>
              <p>用脚本菜单或手动规则把 Po0 入口转发到香港、日本或自备落地。</p>
              <em>查看转发教程 <i>↗</i></em>
            </a>
            <a className="po0-landing__how-step po0-reveal" href="/guide/buying/status-and-looking-glass">
              <span className="po0-landing__how-step-num">03</span>
              <span className="po0-landing__how-step-flag">LIVE</span>
              <h3>测试线路表现</h3>
              <p>结合状态页和 Looking Glass，判断延迟、丢包、路由和晚高峰稳定性。</p>
              <em>查看测试方法 <i>↗</i></em>
            </a>
          </div>

          <AgentDocCard className="po0-landing__agent po0-reveal" />

          <div className="po0-landing__how-cta">
            <a className="po0-landing__btn po0-landing__btn--primary" href="/guide/getting-started">
              <span>跳转完整文档</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </a>
            <a className="po0-landing__btn po0-landing__btn--secondary" href="/guide/faq">
              <span>常见问题 FAQ</span>
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
