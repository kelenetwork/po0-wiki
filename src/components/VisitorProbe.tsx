import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePublicProbeSnapshot } from './probeSnapshot';
import './VisitorProbe.css';

/**
 * 访客延迟自测：浏览器直接向入口探测端点发 HTTPS 请求测 RTT，
 * 再叠加 probe-hub 的「入口 → 出口」实时数据，预估整条链路延迟。
 *
 * 端点域名只存在于代码/网络层，UI 上永远只显示入口标签（不露 IP/域名）。
 */

type EntryDef = {
  id: string;
  label: string;
  tag: string;
  /** probe-hub 中对应的 source id，用于叠加第二段链路 */
  sourceId: string;
  /** 浏览器探测端点（不在 UI 中展示） */
  endpoint: string;
  enabled: boolean;
};

const ENTRIES: EntryDef[] = [
  {
    id: 'east',
    label: '华东入口',
    tag: 'EAST · BGP',
    sourceId: 'SHBGP',
    endpoint: 'https://probe-east.kele.my:2053/probe',
    enabled: true,
  },
  {
    id: 'south',
    label: '华南入口',
    tag: 'SOUTH · BGP',
    sourceId: 'src-rfc-ctc',
    endpoint: '',
    enabled: false, // 官方机器到位后开启
  },
];

const SAMPLE_COUNT = 10;
const SAMPLE_TIMEOUT_MS = 5000;
const WARMUP_COUNT = 2;

type SampleState = {
  status: 'idle' | 'running' | 'done' | 'error';
  samples: number[];
  failed: number;
  error?: string;
};

type EntryResult = {
  median: number | null;
  min: number | null;
  jitter: number | null;
  ok: number;
  total: number;
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function computeResult(state: SampleState): EntryResult {
  const s = state.samples;
  if (s.length === 0) {
    return { median: null, min: null, jitter: null, ok: 0, total: state.samples.length + state.failed };
  }
  let minV = s[0];
  for (let i = 1; i < s.length; i++) if (s[i] < minV) minV = s[i];
  const med = median(s);
  const deviations = s.map((v) => Math.abs(v - med));
  const jitter = deviations.length ? median(deviations) : 0;
  return { median: med, min: minV, jitter, ok: s.length, total: s.length + state.failed };
}

async function measureOnce(endpoint: string): Promise<number | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SAMPLE_TIMEOUT_MS);
  const url = `${endpoint}?t=${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const start = performance.now();
  try {
    await fetch(url, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
    });
    return performance.now() - start;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function qualityFor(ms: number | null): { cls: string; text: string } {
  if (ms === null) return { cls: 'na', text: '无法完成测量 —— 可能被浏览器插件或网络策略拦截' };
  if (ms < 20) return { cls: 'good', text: '延迟优秀 —— 非常适合作为你的主力入口' };
  if (ms < 50) return { cls: 'good', text: '延迟良好 —— 日常使用体验稳定' };
  if (ms < 100) return { cls: 'mid', text: '延迟一般 —— 可用，但可能不是最近的入口' };
  return { cls: 'bad', text: '延迟偏高 —— 你的位置可能离该入口较远' };
}

function fmtMs(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return v.toFixed(digits);
}

export default function VisitorProbe() {
  const { snapshot } = usePublicProbeSnapshot();
  const enabledEntries = useMemo(() => ENTRIES.filter((e) => e.enabled), []);
  const [states, setStates] = useState<Record<string, SampleState>>(() => {
    const init: Record<string, SampleState> = {};
    for (const e of ENTRIES) init[e.id] = { status: 'idle', samples: [], failed: 0 };
    return init;
  });
  const [chainEntryId, setChainEntryId] = useState<string>(enabledEntries[0]?.id ?? 'east');
  const runningRef = useRef(false);

  const runEntry = useCallback(async (entry: EntryDef) => {
    setStates((prev) => ({ ...prev, [entry.id]: { status: 'running', samples: [], failed: 0 } }));
    // 预热：吃掉 DNS + TCP + TLS 握手，不计入样本
    for (let i = 0; i < WARMUP_COUNT; i++) await measureOnce(entry.endpoint);
    const samples: number[] = [];
    let failed = 0;
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const v = await measureOnce(entry.endpoint);
      if (v === null) failed += 1;
      else samples.push(v);
      setStates((prev) => ({
        ...prev,
        [entry.id]: { status: 'running', samples: [...samples], failed },
      }));
    }
    setStates((prev) => ({
      ...prev,
      [entry.id]: {
        status: samples.length > 0 ? 'done' : 'error',
        samples,
        failed,
        error: samples.length > 0 ? undefined : '所有请求均失败',
      },
    }));
  }, []);

  const runAll = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      for (const entry of enabledEntries) {
        await runEntry(entry);
      }
    } finally {
      runningRef.current = false;
    }
  }, [enabledEntries, runEntry]);

  useEffect(() => {
    // 进入页面自动跑一轮（仅启用的入口）
    void runAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const anyRunning = Object.values(states).some((s) => s.status === 'running');

  // 链路预估：选中入口 → probe-hub 中该 source 的所有出口 check
  const chainEntry = ENTRIES.find((e) => e.id === chainEntryId) ?? enabledEntries[0];
  const chainResult = chainEntry ? computeResult(states[chainEntry.id]) : null;
  const chainChecks = useMemo(() => {
    if (!chainEntry) return [];
    return snapshot.checks
      .filter((c) => c.source_id === chainEntry.sourceId && c.latency_ms > 0)
      .map((c) => {
        const target = snapshot.targets.find((t) => t.id === c.target_id);
        return {
          id: c.id,
          targetName: target?.display_name || c.display_name,
          targetRegion: target?.region || '',
          latency: c.latency_ms,
          status: c.status,
        };
      })
      .sort((a, b) => a.latency - b.latency);
  }, [snapshot, chainEntry]);

  return (
    <section className="visitor-probe" aria-label="访客延迟自测">
      <header className="visitor-probe__head">
        <div>
          <p className="visitor-probe__kicker">Visitor Probe · 访客自测</p>
          <h3>测测你到 Po0 入口的延迟</h3>
          <p className="visitor-probe__sub">
            从你当前的网络直接向入口发起测量（HTTPS 往返，非 ICMP），并结合入口到出口的实时探测数据预估整条链路。
          </p>
        </div>
        <button
          type="button"
          className="visitor-probe__run"
          onClick={() => void runAll()}
          disabled={anyRunning}
        >
          {anyRunning ? '测试中…' : '▶ 重新测试'}
        </button>
      </header>

      <div className="visitor-probe__targets">
        {ENTRIES.map((entry) => {
          const state = states[entry.id];
          const result = computeResult(state);
          const quality = entry.enabled ? qualityFor(state.status === 'done' ? result.median : state.status === 'error' ? null : result.median) : null;
          const heights = state.samples.map((v) => {
            const max = Math.max(...state.samples, 1);
            return Math.max(18, Math.round((v / max) * 100));
          });
          const medianV = result.median;
          return (
            <article key={entry.id} className={`visitor-probe__card${entry.enabled ? '' : ' is-pending'}`}>
              <div className="visitor-probe__card-head">
                <span className="visitor-probe__name">
                  <i className={entry.enabled ? 'on' : 'off'} />
                  {entry.label}
                </span>
                <span className="visitor-probe__tag">{entry.tag}</span>
              </div>

              {!entry.enabled ? (
                <p className="visitor-probe__pending">待接入 —— 官方机器上线后开放测试</p>
              ) : state.status === 'idle' ? (
                <p className="visitor-probe__pending">等待测试…</p>
              ) : state.status === 'error' ? (
                <p className="visitor-probe__error">测量失败：{state.error}</p>
              ) : (
                <>
                  <div
                    className={`visitor-probe__bignum ${
                      medianV === null ? '' : medianV < 50 ? 'good' : medianV < 100 ? 'mid' : 'bad'
                    }`}
                  >
                    {state.status === 'running' && state.samples.length === 0 ? (
                      <span className="visitor-probe__spinner">测量中…</span>
                    ) : (
                      <>
                        {fmtMs(medianV)}
                        <small>ms</small>
                      </>
                    )}
                  </div>
                  <div className="visitor-probe__meta">
                    <span>
                      最低 <b>{fmtMs(result.min)}</b>
                    </span>
                    <span>
                      抖动 <b>±{fmtMs(result.jitter)}</b>
                    </span>
                    <span>
                      样本{' '}
                      <b>
                        {result.ok}/{state.status === 'running' ? SAMPLE_COUNT : result.total}
                      </b>
                    </span>
                  </div>
                  <div className="visitor-probe__spark" aria-hidden="true">
                    {Array.from({ length: SAMPLE_COUNT }).map((_, i) => (
                      <span
                        key={i}
                        className={heights[i] !== undefined && state.samples[i] > (medianV ?? 0) * 1.5 ? 'hi' : ''}
                        style={{ height: `${heights[i] ?? 4}%`, opacity: heights[i] === undefined ? 0.25 : 1 }}
                      />
                    ))}
                  </div>
                  {state.status === 'done' && quality ? (
                    <span className={`visitor-probe__quality ${quality.cls}`}>{quality.text}</span>
                  ) : null}
                </>
              )}
            </article>
          );
        })}
      </div>

      <div className="visitor-probe__chain">
        <div className="visitor-probe__chain-head">
          <div>
            <h4>整条链路预估</h4>
            <p>你的实测延迟 + 入口→出口的后端实时探测数据叠加</p>
          </div>
          {enabledEntries.length > 1 && (
            <div className="visitor-probe__chain-switch" role="tablist" aria-label="选择入口">
              {enabledEntries.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  role="tab"
                  aria-selected={chainEntryId === e.id}
                  className={chainEntryId === e.id ? 'on' : ''}
                  onClick={() => setChainEntryId(e.id)}
                >
                  {e.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {!chainEntry || chainResult?.median == null ? (
          <p className="visitor-probe__chain-empty">先完成上方的入口延迟测试，再查看链路预估。</p>
        ) : chainChecks.length === 0 ? (
          <p className="visitor-probe__chain-empty">该入口暂无出口探测数据。</p>
        ) : (
          <div className="visitor-probe__chain-rows">
            {chainChecks.map((chk) => {
              const total = (chainResult.median ?? 0) + chk.latency;
              return (
                <div className="visitor-probe__chain-row" key={chk.id}>
                  <div className="visitor-probe__hop">
                    <span className="lbl">你</span>
                    <span className="sub">本机网络</span>
                  </div>
                  <div className="visitor-probe__link">
                    <span className="ms">{fmtMs(chainResult.median)}ms 实测</span>
                    <div className="line" />
                  </div>
                  <div className="visitor-probe__hop">
                    <span className="lbl">{chainEntry.label}</span>
                    <span className="sub">{chainEntry.tag.split(' ')[0]}</span>
                  </div>
                  <div className="visitor-probe__link">
                    <span className="ms est">≈{fmtMs(chk.latency)}ms 探测</span>
                    <div className="line" />
                  </div>
                  <div className="visitor-probe__hop">
                    <span className="lbl">{chk.targetName}</span>
                    <span className="sub">{chk.targetRegion}</span>
                  </div>
                  <div className="visitor-probe__total">
                    <span className="t1">Total est.</span>
                    <span className="t2">≈{fmtMs(total, 0)}ms</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="visitor-probe__note">
          <b>说明：</b>
          你的延迟为浏览器 HTTPS 往返实测（略高于 ICMP ping 1–3ms）；入口→出口段来自后端探针近期均值；总延迟为两段叠加的估算，实际体验受晚高峰、协议开销等影响。
        </p>
      </div>
    </section>
  );
}
