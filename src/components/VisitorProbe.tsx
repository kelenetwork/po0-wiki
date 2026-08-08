import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePublicProbeSnapshot } from './probeSnapshot';
import './VisitorProbe.css';

/**
 * 访客延迟自测（弹窗版）：
 * - LG 页只放一个轻量入口条，不抢 LG 工具的视觉焦点
 * - 弹窗内：入口卡实测 RTT + 出口 IP 回显（确认直连）+ 链路下拉单条查询
 * - UI 上永远只显示入口标签，不露 IP/域名（端点域名只存在于网络层）
 */

type EntryDef = {
  id: string;
  label: string;
  tag: string;
  sourceId: string;
  endpoint: string;
  enabled: boolean;
};

const ENTRIES: EntryDef[] = [
  {
    id: 'east',
    label: '华东入口',
    tag: 'EAST · BGP',
    sourceId: 'SHBGP',
    endpoint: 'https://probe-east.kele.my:2053',
    enabled: true,
  },
  {
    id: 'south',
    label: '华南入口',
    tag: 'SOUTH · BGP',
    sourceId: 'src-rfc-ctc',
    endpoint: '',
    enabled: false,
  },
];

const SAMPLE_COUNT = 10;
const SAMPLE_TIMEOUT_MS = 8000;
const WARMUP_COUNT = 1;
const EXIT_IP_TIMEOUT_MS = 6000;

// 测量失败时给出的直连分流规则。入口走非标准端口，全局接管模式下
// 需要显式放行，否则请求会被工具链吞掉。
const DIRECT_RULES: { label: string; rule: string }[] = [
  { label: 'Clash / Mihomo', rule: '- DOMAIN-SUFFIX,probe-east.kele.my,DIRECT' },
  { label: 'Surge / Loon / Stash', rule: 'DOMAIN-SUFFIX,probe-east.kele.my,DIRECT' },
  { label: 'Quantumult X', rule: 'host-suffix, probe-east.kele.my, direct' },
  { label: 'sing-box', rule: '{ "domain_suffix": ["probe-east.kele.my"], "outbound": "direct" }' },
];

type SampleState = {
  status: 'idle' | 'running' | 'done' | 'error';
  samples: number[];
  failed: number;
  exitIp?: string;
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function statsOf(state: SampleState) {
  const s = state.samples;
  if (s.length === 0) return { median: null as number | null, min: null as number | null, jitter: null as number | null, ok: 0 };
  let minV = s[0];
  for (let i = 1; i < s.length; i++) if (s[i] < minV) minV = s[i];
  const med = median(s);
  const jitter = median(s.map((v) => Math.abs(v - med)));
  return { median: med, min: minV, jitter, ok: s.length };
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { mode: 'cors', cache: 'no-store', credentials: 'omit', signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function measureOnce(base: string): Promise<number | null> {
  const url = `${base}/probe?t=${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const start = performance.now();
  const resp = await fetchWithTimeout(url, SAMPLE_TIMEOUT_MS);
  // 只认真正到达入口的响应；204 是端点的正常返回
  return resp && resp.ok ? performance.now() - start : null;
}

// 出口 IP 是锦上添花，绝不能拖垮或阻断延迟采样：
// 单独超时、吞掉所有异常，失败就返回 undefined。
async function fetchExitIp(base: string): Promise<string | undefined> {
  try {
    const resp = await fetchWithTimeout(`${base}/ip?t=${Date.now()}`, EXIT_IP_TIMEOUT_MS);
    if (!resp || !resp.ok) return undefined;
    const data = (await resp.json()) as { ip?: string };
    return data.ip || undefined;
  } catch {
    return undefined;
  }
}

function fmtMs(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return v.toFixed(digits);
}

function qualityText(ms: number): string {
  if (ms < 20) return '延迟优秀 —— 非常适合作为你的主力入口';
  if (ms < 50) return '延迟良好 —— 日常使用体验稳定';
  if (ms < 100) return '延迟一般 —— 可用，但可能不是最近的入口';
  return '延迟偏高 —— 你的位置可能离该入口较远';
}

export default function VisitorProbe() {
  const { snapshot } = usePublicProbeSnapshot();
  const enabledEntries = useMemo(() => ENTRIES.filter((e) => e.enabled), []);
  const [open, setOpen] = useState(false);
  const [states, setStates] = useState<Record<string, SampleState>>(() => {
    const init: Record<string, SampleState> = {};
    for (const e of ENTRIES) init[e.id] = { status: 'idle', samples: [], failed: 0 };
    return init;
  });
  const [chainEntryId, setChainEntryId] = useState<string>(enabledEntries[0]?.id ?? 'east');
  const [chainCheckId, setChainCheckId] = useState<string>('');
  const [showRules, setShowRules] = useState(false);
  const [copiedRule, setCopiedRule] = useState<string | null>(null);

  const copyRule = useCallback(async (rule: string) => {
    try {
      await navigator.clipboard.writeText(rule);
    } catch {
      // 非安全上下文或权限被拒时回退到手动选中
      const ta = document.createElement('textarea');
      ta.value = rule;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch {
        /* 复制不可用时用户仍可手动选中文本 */
      }
      document.body.removeChild(ta);
    }
    setCopiedRule(rule);
    setTimeout(() => setCopiedRule((cur) => (cur === rule ? null : cur)), 1600);
  }, []);
  const runningRef = useRef(false);
  const startedRef = useRef(false);

  const runEntry = useCallback(async (entry: EntryDef) => {
    setStates((prev) => ({ ...prev, [entry.id]: { status: 'running', samples: [], failed: 0 } }));

    // 出口 IP 与采样并行：它慢或失败都不该让样本卡在 0/N。
    let exitIp: string | undefined;
    const exitIpTask = fetchExitIp(entry.endpoint).then((ip) => {
      exitIp = ip;
      setStates((prev) => {
        const cur = prev[entry.id];
        return cur.status === 'running' ? { ...prev, [entry.id]: { ...cur, exitIp: ip } } : prev;
      });
    });

    // 预热吃掉 DNS + TCP + TLS 握手，握手本身可能就要 1s 以上
    await measureOnce(entry.endpoint).catch(() => null);

    const samples: number[] = [];
    let failed = 0;
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const v = await measureOnce(entry.endpoint).catch(() => null);
      if (v === null) failed += 1;
      else samples.push(v);
      setStates((prev) => ({ ...prev, [entry.id]: { status: 'running', samples: [...samples], failed, exitIp } }));
      // 连续 3 次全败说明链路不通，早点收尾别让用户干等
      if (failed >= 3 && samples.length === 0) break;
    }

    await exitIpTask.catch(() => undefined);
    setStates((prev) => ({
      ...prev,
      [entry.id]: { status: samples.length > 0 ? 'done' : 'error', samples, failed, exitIp },
    }));
  }, []);

  const runAll = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      for (const entry of enabledEntries) await runEntry(entry);
    } finally {
      runningRef.current = false;
    }
  }, [enabledEntries, runEntry]);

  // 弹窗首次打开时自动测一轮
  useEffect(() => {
    if (open && !startedRef.current) {
      startedRef.current = true;
      void runAll();
    }
  }, [open, runAll]);

  // ESC 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const anyRunning = Object.values(states).some((s) => s.status === 'running');

  const chainEntry = ENTRIES.find((e) => e.id === chainEntryId) ?? enabledEntries[0];
  const chainStats = chainEntry ? statsOf(states[chainEntry.id]) : null;

  const chainOptions = useMemo(() => {
    if (!chainEntry) return [];
    return snapshot.checks
      .filter((c) => c.source_id === chainEntry.sourceId && c.latency_ms > 0)
      .map((c) => {
        const target = snapshot.targets.find((t) => t.id === c.target_id);
        return {
          id: c.id,
          name: target?.display_name || c.display_name,
          region: target?.region || '',
          latency: c.latency_ms,
        };
      })
      .sort((a, b) => a.latency - b.latency);
  }, [snapshot, chainEntry]);

  useEffect(() => {
    // 入口切换 / 数据更新后，默认选延迟最低的一条
    if (chainOptions.length > 0 && !chainOptions.some((o) => o.id === chainCheckId)) {
      setChainCheckId(chainOptions[0].id);
    }
  }, [chainOptions, chainCheckId]);

  const selectedChain = chainOptions.find((o) => o.id === chainCheckId) ?? null;

  // 入口条上的摘要：已完成的最低中位数
  const summary = useMemo(() => {
    const done = enabledEntries
      .map((e) => ({ e, st: statsOf(states[e.id]), status: states[e.id].status }))
      .filter((x) => x.status === 'done' && x.st.median !== null);
    if (done.length === 0) return null;
    const best = done.reduce((a, b) => ((a.st.median ?? 1e9) <= (b.st.median ?? 1e9) ? a : b));
    return { label: best.e.label, ms: best.st.median as number };
  }, [states, enabledEntries]);

  return (
    <>
      <div className="vp-bar">
        <div className="vp-bar__text">
          <span className="vp-bar__dot" />
          <span>
            <b>访客自测</b> · 测测你到 Po0 入口的实际延迟
            {summary ? (
              <em className="vp-bar__summary">
                （上次：{summary.label} {fmtMs(summary.ms)}ms）
              </em>
            ) : null}
          </span>
        </div>
        <button type="button" className="vp-bar__btn" onClick={() => setOpen(true)}>
          开始测试
        </button>
      </div>

      {open ? (
        <div className="vp-modal" role="dialog" aria-modal="true" aria-label="访客延迟自测" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="vp-modal__panel">
            <header className="vp-modal__head">
              <div>
                <p className="vp-modal__kicker">Visitor Probe</p>
                <h3>你到 Po0 入口的延迟</h3>
              </div>
              <div className="vp-modal__actions">
                <button type="button" className="vp-modal__rerun" onClick={() => void runAll()} disabled={anyRunning}>
                  {anyRunning ? '测试中…' : '重新测试'}
                </button>
                <button type="button" className="vp-modal__close" onClick={() => setOpen(false)} aria-label="关闭">
                  ✕
                </button>
              </div>
            </header>

            <div className="vp-modal__cards">
              {ENTRIES.map((entry) => {
                const state = states[entry.id];
                const st = statsOf(state);
                const m = st.median;
                return (
                  <article key={entry.id} className={`vp-card${entry.enabled ? '' : ' is-pending'}`}>
                    <div className="vp-card__head">
                      <span className="vp-card__name">
                        <i className={entry.enabled ? 'on' : 'off'} />
                        {entry.label}
                      </span>
                      <span className="vp-card__tag">{entry.tag}</span>
                    </div>
                    {!entry.enabled ? (
                      <p className="vp-card__pending">待接入 —— 官方机器上线后开放</p>
                    ) : state.status === 'idle' ? (
                      <p className="vp-card__pending">等待测试…</p>
                    ) : state.status === 'error' ? (
                      <div className="vp-card__fail">
                        <p className="vp-card__error">测量失败 —— 请求没能到达入口</p>
                        <ol className="vp-card__hints">
                          <li>关闭浏览器的 HTTPS-Only / 严格安全模式后重试（入口使用非标准端口）</li>
                          <li>暂时停用广告拦截、隐私保护类插件（uBlock、AdGuard 等）</li>
                          <li>若开着全局接管模式的网络工具，加一条直连规则放行本入口</li>
                        </ol>
                        <button
                          type="button"
                          className="vp-card__rules-toggle"
                          onClick={() => setShowRules((v) => !v)}
                        >
                          {showRules ? '收起直连规则' : '查看直连分流规则'}
                        </button>
                        {showRules ? (
                          <div className="vp-rules">
                            {DIRECT_RULES.map((r) => (
                              <div key={r.label} className="vp-rules__item">
                                <span className="vp-rules__label">{r.label}</span>
                                <code>{r.rule}</code>
                                <button
                                  type="button"
                                  onClick={() => void copyRule(r.rule)}
                                  aria-label={`复制 ${r.label} 规则`}
                                >
                                  {copiedRule === r.rule ? '已复制' : '复制'}
                                </button>
                              </div>
                            ))}
                            <p className="vp-rules__note">
                              规则只放行本测速入口，不影响你其它任何分流配置。加完重新测试即可。
                            </p>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <>
                        <div className={`vp-card__num ${m === null ? '' : m < 50 ? 'good' : m < 100 ? 'mid' : 'bad'}`}>
                          {state.status === 'running' && state.samples.length === 0 ? (
                            <span className="vp-card__wait">测量中…</span>
                          ) : (
                            <>
                              {fmtMs(m)}
                              <small>ms</small>
                            </>
                          )}
                        </div>
                        <div className="vp-card__meta">
                          <span>
                            最低 <b>{fmtMs(st.min)}</b>
                          </span>
                          <span>
                            抖动 <b>±{fmtMs(st.jitter)}</b>
                          </span>
                          <span>
                            样本 <b>{st.ok}/{SAMPLE_COUNT}</b>
                          </span>
                        </div>
                        {state.exitIp ? (
                          <div className="vp-card__exit">
                            入口看到你的 IP：<code>{state.exitIp}</code>
                            <span className="vp-card__exit-hint">与你的宽带出口一致 = 直连测量有效；若是代理 IP 说明请求被代理接管</span>
                          </div>
                        ) : null}
                        {state.status === 'done' && m !== null ? (
                          <span className={`vp-card__quality ${m < 50 ? 'good' : m < 100 ? 'mid' : 'bad'}`}>{qualityText(m)}</span>
                        ) : null}
                      </>
                    )}
                  </article>
                );
              })}
            </div>

            <div className="vp-chain">
              <div className="vp-chain__pickers">
                <h4>链路预估</h4>
                {enabledEntries.length > 1 ? (
                  <select value={chainEntryId} onChange={(e) => setChainEntryId(e.target.value)} aria-label="选择入口">
                    {enabledEntries.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.label}
                      </option>
                    ))}
                  </select>
                ) : null}
                <select value={chainCheckId} onChange={(e) => setChainCheckId(e.target.value)} aria-label="选择出口线路">
                  {chainOptions.length === 0 ? <option value="">暂无出口探测数据</option> : null}
                  {chainOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}（{fmtMs(o.latency, 0)}ms）
                    </option>
                  ))}
                </select>
              </div>

              {chainEntry && selectedChain && chainStats?.median != null ? (
                <div className="vp-chain__row">
                  <div className="vp-chain__hop">
                    <span className="lbl">你</span>
                  </div>
                  <div className="vp-chain__link">
                    <span className="ms">{fmtMs(chainStats.median)}ms 实测</span>
                    <div className="line" />
                  </div>
                  <div className="vp-chain__hop">
                    <span className="lbl">{chainEntry.label}</span>
                  </div>
                  <div className="vp-chain__link">
                    <span className="ms est">≈{fmtMs(selectedChain.latency)}ms 探测</span>
                    <div className="line" />
                  </div>
                  <div className="vp-chain__hop">
                    <span className="lbl">{selectedChain.name}</span>
                  </div>
                  <div className="vp-chain__total">
                    <span className="t1">Total est.</span>
                    <span className="t2">≈{fmtMs((chainStats.median ?? 0) + selectedChain.latency, 0)}ms</span>
                  </div>
                </div>
              ) : (
                <p className="vp-chain__empty">完成入口测试后即可查看链路预估。</p>
              )}

              <p className="vp-chain__note">
                你的延迟为浏览器 HTTPS 往返实测（略高于 ICMP ping 1–3ms）；入口→出口来自后端探针近期均值；总延迟为估算，实际受晚高峰与协议开销影响。
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
