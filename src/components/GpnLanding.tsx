import { useEffect, useState } from 'react';
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

    // 兜底：JS 环境异常时 800ms 强制显示，避免白屏（Po0Landing 同款教训）
    const timer = window.setTimeout(() => {
      targets.forEach((node) => node.classList.add('is-in'));
    }, 800);

    return () => {
      io.disconnect();
      window.clearTimeout(timer);
    };
  }, []);
}

function FlowDiagram() {
  return (
    <svg viewBox="0 0 760 240" fill="none" aria-label="5gpn-NEXT 分流架构图">
      <g>
        <rect x="10" y="22" width="150" height="44" rx="10" className="gpn-node-soft" />
        <text x="85" y="44" textAnchor="middle" className="gpn-t-name">iPhone</text>
        <text x="85" y="59" textAnchor="middle" className="gpn-t-sub">蜂窝 DNS 模式</text>
        <rect x="10" y="98" width="150" height="44" rx="10" className="gpn-node-soft" />
        <text x="85" y="120" textAnchor="middle" className="gpn-t-name">iPhone</text>
        <text x="85" y="135" textAnchor="middle" className="gpn-t-sub">Relay 模式</text>
        <rect x="10" y="174" width="150" height="44" rx="10" className="gpn-node-soft" />
        <text x="85" y="196" textAnchor="middle" className="gpn-t-name">Android</text>
        <text x="85" y="211" textAnchor="middle" className="gpn-t-sub">私人 DNS</text>
      </g>
      <g className="gpn-lines">
        <path d="M160 44 C 230 44 240 108 300 114" />
        <path d="M160 120 L 300 120" />
        <path d="M160 196 C 230 196 240 132 300 126" />
      </g>
      <rect x="300" y="86" width="170" height="68" rx="13" className="gpn-node-brand" />
      <text x="385" y="115" textAnchor="middle" className="gpn-t-gw">5gpn-NEXT 网关</text>
      <text x="385" y="134" textAnchor="middle" className="gpn-t-gwsub">KFCHOST · 内网卡入口</text>
      <g className="gpn-lines">
        <path d="M470 105 C 540 100 545 52 610 48" />
        <path d="M470 135 C 540 140 545 188 610 192" />
      </g>
      <rect x="610" y="26" width="140" height="44" rx="10" className="gpn-node-plain" />
      <text x="680" y="48" textAnchor="middle" className="gpn-t-name gpn-t-ink">国内站点</text>
      <text x="680" y="63" textAnchor="middle" className="gpn-t-sub">手机本地直连 · 不绕网关</text>
      <rect x="610" y="170" width="140" height="44" rx="10" className="gpn-node-plain" />
      <text x="680" y="192" textAnchor="middle" className="gpn-t-name gpn-t-ink">国外站点</text>
      <text x="680" y="207" textAnchor="middle" className="gpn-t-sub2">落地节点 · 多出口热切换</text>
    </svg>
  );
}

export default function GpnLanding() {
  useReveal();
  const [tab, setTab] = useState<'dns' | 'relay'>('dns');

  return (
    <div className="gpn-landing">
      <div className="gpn-hero">
        <div className="gpn-wrap">
          <span className="gpn-tag"><span className="gpn-dot" />基于 KFCHOST 5GPN 内网卡</span>
          <h1>手机不装客户端的<br /><em>智能分流网关</em></h1>
          <p className="gpn-lede">
            5gpn-NEXT：一张描述文件或一个私人 DNS 域名，国内流量本地直连、国外流量走你的节点。
            没有 Clash，没有 VPN 图标，没有 tun。
          </p>
          <div className="gpn-cta">
            <a className="gpn-btn-p" href="/guide/5gpn/what-is-5gpn">快速开始 →</a>
            <a className="gpn-btn-s" href={GITHUB} target="_blank" rel="noreferrer">GitHub</a>
          </div>
          <div className="gpn-trust">
            <span>iOS 17+ / Android 9+</span>
            <span>单文件部署 · 26MB 内存</span>
            <span>开源 MIT</span>
          </div>
          <div className="gpn-flow gpn-rv">
            <FlowDiagram />
            <div className="gpn-cap">国内域名与 IP 由 GEOIP 判定后直接本地直连；只有国外流量进入网关分流</div>
          </div>
        </div>
      </div>

      <section>
        <div className="gpn-wrap">
          <div className="gpn-kicker gpn-rv">开始之前</div>
          <h2 className="gpn-rv">使用前提，请先确认</h2>
          <p className="gpn-desc gpn-rv">5gpn-NEXT 依赖 KFCHOST 的 5GPN 内网卡链路，以下条件缺一不可。</p>
          <div className="gpn-prereq">
            <div className="gpn-pcard gpn-rv">
              <span className="gpn-badge">限制 1</span>
              <h3>🖥 VPS 仅支持 KFC 网段</h3>
              <p>网关必须部署在 <b>KFCHOST 的机器 / 网段</b>上，内网卡流量才能到达。其他任意厂商的 VPS 目前<b>不可用</b>。</p>
            </div>
            <div className="gpn-pcard gpn-rv">
              <span className="gpn-badge">限制 2</span>
              <h3>📶 仅支持浙江联通卡</h3>
              <p>5GPN 内网卡目前仅支持<b>浙江联通</b>，且需要<b>自行办理</b>；办卡后在 KFCHOST 控制台绑定即可接入。</p>
            </div>
            <div className="gpn-pcard gpn-rv">
              <span className="gpn-badge">前提 3</span>
              <h3>🌐 一个自有域名</h3>
              <p>用于签发 TLS 证书与手机接入入口，需要能自行修改 <b>DNS 解析记录</b>。</p>
            </div>
          </div>
        </div>
      </section>

      <section className="gpn-alt">
        <div className="gpn-wrap">
          <div className="gpn-kicker gpn-rv">能力</div>
          <h2 className="gpn-rv">为什么是 5gpn-NEXT</h2>
          <p className="gpn-desc gpn-rv">传统「DNS 劫持 + SNI 嗅探」网关的痛点，这里从入口层面解决。</p>
          <div className="gpn-grid">
            <div className="gpn-card gpn-rv"><div className="gpn-ic">📱</div><h3>手机零客户端</h3><p>iOS 装一张描述文件，Android 填一个私人 DNS 域名。没有 App、没有订阅、没有 VPN 图标。</p></div>
            <div className="gpn-card gpn-rv"><div className="gpn-ic">📶</div><h3>Wi-Fi 零影响</h3><p>iOS 蜂窝 DNS 模式仅在蜂窝数据下生效，连 Wi-Fi 自动停用，家庭网络完全不经过网关。</p></div>
            <div className="gpn-card gpn-rv"><div className="gpn-ic">🧭</div><h3>三层智能分流</h3><p>手机侧直连名单 + 11 万条域名规则 + GEOIP 兜底，国内流量手机本地直连，规则每日自动更新。</p></div>
            <div className="gpn-card gpn-rv"><div className="gpn-ic">📍</div><h3>修改定位<span className="gpn-new">NEW</span></h3><p>一键修改手机上报的地理定位，打卡、区域限定 App 测试等场景即开即用，随时恢复真实位置。</p></div>
            <div className="gpn-card gpn-rv"><div className="gpn-ic">💬</div><h3>WhatsApp 也能用</h3><p>DNS 线索回退还原无 SNI 私有协议目的地；Relay 模式则原生覆盖全部协议。</p></div>
            <div className="gpn-card gpn-rv"><div className="gpn-ic">🤖</div><h3>Telegram Bot 管理</h3><p>切换出口、改分流规则、逐层诊断、一键升级回退，全在聊天窗口完成。</p></div>
          </div>
        </div>
      </section>

      <section>
        <div className="gpn-wrap">
          <div className="gpn-kicker gpn-rv">部署</div>
          <h2 className="gpn-rv">三步上线</h2>
          <p className="gpn-desc gpn-rv">满足前提后，从一台干净的 KFC 机器到手机连通，大约十分钟。</p>
          <div className="gpn-how">
            <div className="gpn-card gpn-rv"><div className="gpn-st">准备</div><p>KFCHOST 机器（Debian 12+，512MB 起）+ 已绑定的浙江联通 5GPN 卡 + 域名解析指向机器。</p></div>
            <div className="gpn-card gpn-rv"><div className="gpn-st">一键安装</div><p>脚本自动完成证书签发、防火墙、systemd 服务与描述文件生成。</p>
              <pre>{`# 在 KFC 机器上执行
curl -fsSL https://raw.githubusercontent.com/
kelenetwork/5gpn-next/main/install.sh | sudo bash`}</pre>
            </div>
            <div className="gpn-card gpn-rv"><div className="gpn-st">手机接入</div><p>iOS 安装描述文件（下方两种模式二选一），Android 填私人 DNS 域名，立即生效。</p></div>
          </div>
        </div>
      </section>

      <section className="gpn-alt">
        <div className="gpn-wrap gpn-center">
          <div className="gpn-kicker gpn-rv">iOS 接入</div>
          <h2 className="gpn-rv">两种模式，按需选择</h2>
          <p className="gpn-desc gpn-rv gpn-desc-center">同一个网关，两种接入方式，随时可切换。</p>
          <div className="gpn-tabs gpn-rv">
            <div className="gpn-tabbar" role="tablist">
              <button type="button" role="tab" aria-selected={tab === 'dns'} className={tab === 'dns' ? 'on' : ''} onClick={() => setTab('dns')}>📡 蜂窝 DNS 模式</button>
              <button type="button" role="tab" aria-selected={tab === 'relay'} className={tab === 'relay' ? 'on' : ''} onClick={() => setTab('relay')}>🔗 Relay 模式（实验性）</button>
            </div>
            {tab === 'dns' ? (
              <div className="gpn-pane" role="tabpanel">
                <h3>蜂窝 DNS 模式 <span className="gpn-rec">推荐日常使用</span></h3>
                <p className="gpn-sub">仅蜂窝数据下启用加密 DNS，连上 Wi-Fi 自动停用 —— 家里、公司的网络完全不受影响。</p>
                <div className="gpn-kv">
                  <div><b>Wi-Fi 影响</b><span className="ok">无 · 自动停用</span></div>
                  <div><b>国内流量</b><span className="ok">GEOIP 手机本地直连</span></div>
                  <div><b>协议覆盖</b><span>HTTPS/SNI + DNS 线索回退</span></div>
                  <div><b>WhatsApp</b><span className="ok">支持（线索回退）</span></div>
                </div>
              </div>
            ) : (
              <div className="gpn-pane" role="tabpanel">
                <h3>Relay 模式 <span className="gpn-rec gpn-rec-mute">实验性 · 谨慎使用</span></h3>
                <p className="gpn-sub">iOS 原生 Network Relay，TCP 协议覆盖最完整；但蜂窝与 Wi-Fi 同时生效（会覆盖家内分流），且 UDP/QUIC 未支持，短视频 App 可能卡顿。日常请优先选蜂窝 DNS 模式。</p>
                <div className="gpn-kv">
                  <div><b>Wi-Fi 影响</b><span>蜂窝 / Wi-Fi 同时生效</span></div>
                  <div><b>UDP / QUIC</b><span>未支持，短视频可能卡</span></div>
                  <div><b>协议覆盖</b><span className="ok">TCP 完整 · 含无 SNI</span></div>
                  <div><b>WhatsApp</b><span>IPv6 环境可能不可用</span></div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section>
        <div className="gpn-wrap">
          <div className="gpn-kicker gpn-rv">FAQ</div>
          <h2 className="gpn-rv">常见问题</h2>
          <div className="gpn-faq">
            <details className="gpn-rv"><summary>可以用其他厂商的 VPS 吗？</summary><div className="gpn-a">暂时不行。5GPN 内网卡的流量只会送达 KFCHOST 的网段，网关必须部署在 KFC 机器上。</div></details>
            <details className="gpn-rv"><summary>移动 / 电信 / 其他省份的联通卡可以吗？</summary><div className="gpn-a">目前仅支持浙江联通卡，且需自行办理后在控制台绑定。其他运营商与省份暂不可用。</div></details>
            <details className="gpn-rv"><summary>会影响我家里的 Wi-Fi 吗？</summary><div className="gpn-a">选「蜂窝 DNS 模式」完全不会 —— 它只在蜂窝数据下生效。Relay 模式则蜂窝和 Wi-Fi 同时生效，介意请选前者。</div></details>
            <details className="gpn-rv"><summary>修改定位是怎么实现的？安全吗？</summary><div className="gpn-a">定位修改在网关侧完成，只影响走网关链路的应用视角，可随时一键恢复真实位置，不改动手机系统。</div></details>
          </div>
        </div>
      </section>

      <div className="gpn-footcta">
        <div className="gpn-wrap">
          <h2 className="gpn-rv">开始使用</h2>
          <p className="gpn-desc gpn-rv gpn-desc-center">跟着教程从零到连通，大约十分钟。</p>
          <div className="gpn-cta gpn-rv">
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
