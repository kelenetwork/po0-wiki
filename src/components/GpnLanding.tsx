import { useEffect } from 'react';
import './GpnLanding.css';

const GITHUB = 'https://github.com/kelenetwork/5gpn-next';

function useReveal() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.gpn-landing');
    const targets = Array.from(document.querySelectorAll<HTMLElement>('.gpn-rv'));
    root?.setAttribute('data-reveal-ready', 'true');

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    targets.forEach((node) => io.observe(node));

    // 兜底：JS 环境异常时 800ms 强制显示，避免 hydration 异常导致白屏。
    const timer = window.setTimeout(() => {
      targets.forEach((node) => node.classList.add('is-in'));
    }, 800);

    return () => {
      io.disconnect();
      window.clearTimeout(timer);
    };
  }, []);
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function IcoCheck() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IcoServer() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <rect x="2" y="4" width="20" height="12" rx="2" />
      <path d="M6 20h12M12 16v4" />
    </svg>
  );
}
function IcoPhone() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <rect x="5" y="2" width="14" height="20" rx="3" />
      <path d="M12 18h.01" />
    </svg>
  );
}
function IcoGlobe() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15 15 0 010 20 15 15 0 010-20z" />
    </svg>
  );
}
function IcoWifi() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M5 13a10 10 0 0114 0M8.5 16.5a5 5 0 017 0M12 20h.01" />
    </svg>
  );
}
function IcoSplit() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M16 3h5v5M8 21H3v-5M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}
function IcoShield() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}
function IcoSwap() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M17 2l4 4-4 4M3 6h18M7 22l-4-4 4-4M21 18H3" />
    </svg>
  );
}
function IcoSearch() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

function FlowDiagram() {
  return (
    <svg viewBox="0 0 760 250" fill="none" aria-label="5gpn-NEXT 加密 DNS 分流架构图">
      <rect x="10" y="58" width="150" height="48" rx="12" className="gpn-node-soft" />
      <text x="85" y="80" textAnchor="middle" className="gpn-t-name">iPhone / iPad</text>
      <text x="85" y="96" textAnchor="middle" className="gpn-t-sub">蜂窝加密 DNS</text>
      <rect x="10" y="148" width="150" height="48" rx="12" className="gpn-node-soft" />
      <text x="85" y="170" textAnchor="middle" className="gpn-t-name">Android</text>
      <text x="85" y="186" textAnchor="middle" className="gpn-t-sub">系统私人 DNS</text>

      <g className="gpn-lines">
        <path d="M160 82 C 220 82 235 109 290 112" />
        <path d="M160 172 C 220 172 235 142 290 138" />
      </g>

      <rect x="290" y="84" width="190" height="80" rx="16" className="gpn-node-brand" />
      <text x="385" y="115" textAnchor="middle" className="gpn-t-gw">5gpn-NEXT 网关</text>
      <text x="385" y="137" textAnchor="middle" className="gpn-t-gwsub">DoT 决策 · 分流 · 广告拦截</text>

      <g className="gpn-lines">
        <path d="M480 104 C 540 99 550 43 610 43" />
        <path d="M480 124 L 610 124" />
        <path d="M480 144 C 540 149 550 205 610 205" />
      </g>

      <rect x="610" y="19" width="140" height="48" rx="12" className="gpn-node-soft" />
      <text x="680" y="41" textAnchor="middle" className="gpn-t-name">国内目标</text>
      <text x="680" y="57" textAnchor="middle" className="gpn-t-sub">返回真实 IP · 手机直连</text>

      <rect x="610" y="100" width="140" height="48" rx="12" className="gpn-node-soft" />
      <text x="680" y="122" textAnchor="middle" className="gpn-t-name">国外目标</text>
      <text x="680" y="138" textAnchor="middle" className="gpn-t-sub">返回网关 IP · 出口转发</text>

      <rect x="610" y="181" width="140" height="48" rx="12" className="gpn-node-ad" />
      <text x="680" y="203" textAnchor="middle" className="gpn-t-ad">广告域名</text>
      <text x="680" y="219" textAnchor="middle" className="gpn-t-sub">NXDOMAIN · 直接拦截</text>
    </svg>
  );
}

export default function GpnLanding() {
  useReveal();

  return (
    <div className="gpn-landing">
      <div className="gpn-hero">
        <div className="gpn-wrap gpn-hero-grid">
          <div>
            <span className="gpn-tag"><span className="gpn-dot" />KFCHOST 5GPN 内网卡专属</span>
            <h1>手机不装代理 App 的<br /><em>加密 DNS 分流网关</em></h1>
            <p className="gpn-lede">
              iPhone 安装一张蜂窝 DNS 描述文件，Android 填一个私人 DNS 域名。
              国内流量本地直连、国外流量进入网关，广告域名在 DNS 层直接拦截。
            </p>
            <div className="gpn-cta">
              <a className="gpn-btn-p" href="/guide/5gpn/what-is-5gpn">快速开始 →</a>
              <a className="gpn-btn-s" href={GITHUB} target="_blank" rel="noreferrer">GitHub</a>
            </div>
            <div className="gpn-trust">
              <span><IcoCheck />iOS 17+ / Android 9+</span>
              <span><IcoCheck />无根证书 · 不解密 TLS</span>
              <span><IcoCheck />开源 MIT</span>
            </div>
          </div>
          <div className="gpn-flow gpn-rv">
            <FlowDiagram />
            <div className="gpn-cap">规则按顺序命中即停：私网保护 → 用户规则 → 广告规则 → 国内直连兜底 → 国外默认出口</div>
          </div>
        </div>
      </div>

      <section>
        <div className="gpn-wrap gpn-center">
          <span className="gpn-kicker gpn-rv">开始之前</span>
          <h2 className="gpn-rv">使用前提，请先确认</h2>
          <p className="gpn-desc gpn-rv">5gpn-NEXT 依赖 KFCHOST 的 5GPN 内网卡链路，以下条件缺一不可。</p>
          <div className="gpn-prereq">
            <div className="gpn-pcard gpn-rv">
              <span className="gpn-ico"><IcoServer /></span>
              <h3>VPS 仅支持 KFC 网段</h3>
              <p>网关必须部署在 <b>KFCHOST 的机器 / 网段</b>上，内网卡流量才能到达。其他厂商的 VPS 目前不可用。</p>
            </div>
            <div className="gpn-pcard gpn-rv">
              <span className="gpn-ico"><IcoPhone /></span>
              <h3>仅支持浙江联通卡</h3>
              <p>5GPN 内网卡目前仅支持<b>浙江联通</b>，需要自行办理；办卡后在 KFCHOST 控制台绑定即可接入。</p>
            </div>
            <div className="gpn-pcard gpn-rv">
              <span className="gpn-ico"><IcoGlobe /></span>
              <h3>一个自有域名</h3>
              <p>用于签发 TLS 证书与手机接入，需要能修改 DNS A 记录；Cloudflare 必须使用灰云直连。</p>
            </div>
          </div>
        </div>
      </section>

      <section className="gpn-alt">
        <div className="gpn-wrap gpn-center">
          <span className="gpn-kicker gpn-rv">能力</span>
          <h2 className="gpn-rv">一套清楚、可控的服务端策略</h2>
          <p className="gpn-desc gpn-rv">不碰系统定位，不安装根证书，也不解密用户流量；只处理加密 DNS 决策与网关转发。</p>
          <div className="gpn-grid">
            <div className="gpn-card gpn-rv"><span className="gpn-ico"><IcoPhone /></span><h3>手机零代理客户端</h3><p>iOS 装一张系统描述文件，Android 使用系统私人 DNS。没有代理 App、订阅导入或常驻 VPN 图标。</p></div>
            <div className="gpn-card gpn-rv"><span className="gpn-ico"><IcoWifi /></span><h3>iOS Wi-Fi 零影响</h3><p>蜂窝 DNS 描述文件只在蜂窝网络启用，连接家庭或公司 Wi-Fi 后自动停用。</p></div>
            <div className="gpn-card gpn-rv"><span className="gpn-ico"><IcoSplit /></span><h3>国内外有序分流</h3><p>域名规则、GEOIP 与自定义策略按 first-match 执行；国内手机直连，国外进入指定出口。</p></div>
            <div className="gpn-card gpn-rv"><span className="gpn-ico"><IcoShield /></span><h3>DNS 广告拦截</h3><p>anti-AD 规则、白名单、最近命中与高频域名一体化；规则每 24 小时刷新。</p></div>
            <div className="gpn-card gpn-rv"><span className="gpn-ico"><IcoSwap /></span><h3>多出口热切换</h3><p>本机公网或 mihomo 节点均可作为国外出口，切换前先做真实端到端验证。</p></div>
            <div className="gpn-card gpn-rv"><span className="gpn-ico"><IcoSearch /></span><h3>管理与逐层诊断</h3><p>Bot 与内网 Web 共用同一套动作；策略、出口、连接、应用层故障可以逐层定位。</p></div>
          </div>
        </div>
      </section>

      <section>
        <div className="gpn-wrap gpn-center">
          <span className="gpn-kicker gpn-rv">可观测拦截</span>
          <h2 className="gpn-rv">每一次“成功拦截”都有明确含义</h2>
          <p className="gpn-desc gpn-rv">只有 NXDOMAIN 已成功写回手机才计数，不把规则命中或断开的连接冒充为成功。</p>
          <div className="gpn-proof">
            <div className="gpn-pf gpn-rv"><strong>今日 / 7日 / 30日</strong><span>自然日成功次数</span></div>
            <div className="gpn-pf gpn-rv"><strong>最近 100 条</strong><span>域名与命中时间</span></div>
            <div className="gpn-pf gpn-rv"><strong>Top 400</strong><span>按域名聚合排行</span></div>
            <div className="gpn-pf gpn-rv"><strong>0 客户端标识</strong><span>不记录 IP 与正常访问</span></div>
          </div>
          <p className="gpn-privacy gpn-rv">Bot 与内网 Web 都能查看统计、开关拦截和管理白名单；完整 URL、客户端 IP、正常访问明细不会写入记录。</p>
        </div>
      </section>

      <section className="gpn-alt">
        <div className="gpn-wrap gpn-center">
          <span className="gpn-kicker gpn-rv">部署</span>
          <h2 className="gpn-rv">三步上线</h2>
          <p className="gpn-desc gpn-rv">满足前提后，从一台干净的 KFC 机器到手机连通，大约十分钟。</p>
          <div className="gpn-how">
            <div className="gpn-step gpn-rv">
              <span className="gpn-st">1</span>
              <h3>准备</h3>
              <p>KFCHOST 机器（Debian 12+，512MB 起）+ 已绑定的浙江联通 5GPN 卡 + 指向机器的域名。</p>
            </div>
            <div className="gpn-step gpn-rv">
              <span className="gpn-st">2</span>
              <h3>一键安装</h3>
              <p>脚本自动完成证书、防火墙、systemd 与接入文件生成。</p>
              <pre>curl -fsSL https://raw.githubusercontent.com/kelenetwork/5gpn-next/main/install.sh | sudo bash</pre>
            </div>
            <div className="gpn-step gpn-rv">
              <span className="gpn-st">3</span>
              <h3>接入与管理</h3>
              <p>iOS 安装蜂窝 DNS 描述文件，Android 填私人 DNS；需要时再从 Bot 或面板开启广告拦截。</p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="gpn-wrap gpn-center">
          <span className="gpn-kicker gpn-rv">客户端接入</span>
          <h2 className="gpn-rv">两个平台，一套加密 DNS 架构</h2>
          <p className="gpn-desc gpn-rv">iOS 只有一张蜂窝 DNS 描述文件；Android 使用系统私人 DNS。两者共享同一套规则、出口与广告拦截。</p>
          <div className="gpn-access-grid">
            <article className="gpn-access gpn-rv">
              <h3>iPhone / iPad <span className="gpn-pill">仅蜂窝生效</span></h3>
              <p>Bot → 客户端接入 → 获取 iOS 描述文件，随后在「VPN 与设备管理」安装。连接 Wi-Fi 后自动停用。</p>
              <div className="gpn-kv">
                <div><b>系统要求</b><span>iOS / iPadOS 17+</span></div>
                <div><b>DNS 协议</b><span className="ok">DoT 加密</span></div>
                <div><b>Wi-Fi 影响</b><span className="ok">无 · 自动停用</span></div>
                <div><b>UDP / QUIC</b><span>促使回落 TCP</span></div>
              </div>
            </article>
            <article className="gpn-access gpn-rv">
              <h3>Android <span className="gpn-pill gpn-pill-mute">系统私人 DNS</span></h3>
              <p>设置 → 网络和互联网 → 私人 DNS，选择指定主机名并填入网关域名。无需安装任何应用。</p>
              <div className="gpn-kv">
                <div><b>系统要求</b><span>Android 9+</span></div>
                <div><b>DNS 协议</b><span className="ok">DoT 加密</span></div>
                <div><b>Wi-Fi 影响</b><span>系统级，必要时切回自动</span></div>
                <div><b>UDP / QUIC</b><span>促使回落 TCP</span></div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="gpn-alt">
        <div className="gpn-wrap gpn-center">
          <span className="gpn-kicker gpn-rv">FAQ</span>
          <h2 className="gpn-rv">常见问题</h2>
          <div className="gpn-faq">
            <details className="gpn-rv"><summary>可以用其他厂商的 VPS 吗？</summary><div className="gpn-a">暂时不行。5GPN 内网卡的流量只会送达 KFCHOST 网段，网关必须部署在 KFC 机器上。</div></details>
            <details className="gpn-rv"><summary>移动、电信或其他省份联通卡可以吗？</summary><div className="gpn-a">目前仅支持浙江联通卡，并需自行办理后在 KFCHOST 控制台绑定。</div></details>
            <details className="gpn-rv"><summary>会影响家里的 Wi-Fi 吗？</summary><div className="gpn-a">iOS 描述文件仅在蜂窝数据下生效，连 Wi-Fi 自动停用。Android 私人 DNS 是系统级设置，若家庭网络无法访问网关，请切回「自动」。</div></details>
            <details className="gpn-rv"><summary>广告拦截导致某个 App 白屏怎么办？</summary><div className="gpn-a">在 Bot 或内网面板查看最近命中，把被误杀的域名加入白名单即可立即放行。</div></details>
            <details className="gpn-rv"><summary>它会修改定位或解密 HTTPS 吗？</summary><div className="gpn-a">不会。当前版本不修改系统位置、不生成根证书，也不做 TLS 中间人解密。</div></details>
          </div>
        </div>
      </section>

      <div className="gpn-footcta">
        <div className="gpn-wrap gpn-center">
          <h2 className="gpn-rv">从零到连通</h2>
          <p className="gpn-desc gpn-rv">教程覆盖从装机到手机接入的完整路线。</p>
          <div className="gpn-cta gpn-cta-center gpn-rv">
            <a className="gpn-btn-p" href="/guide/5gpn/install">阅读部署教程 →</a>
            <a className="gpn-btn-s" href="/guide/5gpn/faq">查看常见问题</a>
          </div>
        </div>
      </div>

      <footer className="gpn-foot">
        5gpn-NEXT · MIT License · <a href={GITHUB} target="_blank" rel="noreferrer">GitHub</a> · 基于 <a href="https://kfchost.com" target="_blank" rel="noreferrer">KFCHOST</a> 5GPN
      </footer>
    </div>
  );
}
