import React, { useEffect, useMemo, useState } from 'react';
import './LookingGlass.css';
import { PublicProbeItem, usePublicProbeSnapshot } from './probeSnapshot';

type RegionGroup = {
  region: string;
  summary: string;
  nodes: PublicProbeItem[];
};

type LGTool = 'ping' | 'tcping' | 'mtr' | 'nexttrace' | 'traceroute';

function isOnline(status: string) {
  return status === 'online' || status === 'ok';
}

function groupSources(nodes: PublicProbeItem[]): RegionGroup[] {
  const groups = new Map<string, PublicProbeItem[]>();
  nodes.forEach((node) => {
    const items = groups.get(node.region) ?? [];
    items.push(node);
    groups.set(node.region, items);
  });

  return Array.from(groups.entries()).map(([region, items]) => ({
    region,
    summary: Array.from(new Set(items.flatMap((item) => item.tags))).join(' / ') || 'public node',
    nodes: items,
  }));
}

function nodeTone(status: string) {
  if (isOnline(status)) return 'online';
  if (status === 'warn' || status === 'busy') return 'busy';
  return 'standby';
}

function defaultOnlineSourceId(sources: PublicProbeItem[]) {
  return sources.find((source) => isOnline(source.status))?.id ?? '';
}

type LGResult = {
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout' | string;
  output?: string;
  error?: string;
  started_at?: string;
  completed_at?: string;
};

function renderTerminalLines(value: string) {
  const lines = value.split('\n');
  return (
    <>
      {lines.map((line, i) => {
        let cls = 'tl';
        if (line.startsWith('✓')) cls = 'tl tl--ok';
        else if (line.startsWith('⚠') || /error|failed|timeout/i.test(line)) cls = 'tl tl--err';
        else if (line.startsWith('#') || line.startsWith('---')) cls = 'tl tl--dim';
        else if (line.startsWith('$') || /^\$\s/.test(line)) cls = 'tl tl--cmd';

        const parts: React.ReactNode[] = [];
        const re = /(time=\s*([\d.]+)\s*ms|([\d.]+)\s*ms\b|(\d+(?:\.\d+)?)%\s*(?:loss|packet loss))/g;
        let lastIdx = 0;
        let match: RegExpExecArray | null;
        let key = 0;
        while ((match = re.exec(line)) !== null) {
          if (match.index > lastIdx) parts.push(line.slice(lastIdx, match.index));
          const token = match[0];
          let tone = 'tk tk--good';
          const num = parseFloat(match[2] ?? match[3] ?? match[4] ?? '0');
          if (match[4] !== undefined) {
            tone = num >= 5 ? 'tk tk--bad' : num >= 1 ? 'tk tk--mid' : 'tk tk--good';
          } else {
            tone = num >= 200 ? 'tk tk--bad' : num >= 80 ? 'tk tk--mid' : 'tk tk--good';
          }
          parts.push(<span key={`k${i}-${key++}`} className={tone}>{token}</span>);
          lastIdx = match.index + token.length;
        }
        if (lastIdx < line.length) parts.push(line.slice(lastIdx));
        if (parts.length === 0) parts.push(line || '\u00a0');

        return (
          <span key={i} className={cls}>
            {parts}
            {i < lines.length - 1 ? '\n' : ''}
          </span>
        );
      })}
    </>
  );
}

const initialTerminal = [
  '选择发起点、目标和工具后开始检测。',
  '结果会在这里实时显示，适合排查访问路径与响应情况。',
].join('\n');

export default function LookingGlass() {
  const { snapshot, origin } = usePublicProbeSnapshot();
  const lgTargets = useMemo(() => snapshot.targets.filter((target) => target.show_in_lg !== false), [snapshot.targets]);
  const regionGroups = groupSources(snapshot.sources);
  const onlineCount = snapshot.sources.filter((n) => isOnline(n.status)).length;
  const [selectedSourceId, setSelectedSourceId] = useState(defaultOnlineSourceId(snapshot.sources));
  const [selectedTargetId, setSelectedTargetId] = useState(lgTargets[0]?.id ?? '');
  const [selectedTool, setSelectedTool] = useState<LGTool>('mtr');
  const [terminalOutput, setTerminalOutput] = useState(initialTerminal);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    setSelectedSourceId((current) => {
      if (current && snapshot.sources.some((s) => s.id === current && isOnline(s.status))) return current;
      return defaultOnlineSourceId(snapshot.sources);
    });
    setSelectedTargetId((current) => {
      if (current && lgTargets.some((target) => target.id === current)) return current;
      return lgTargets[0]?.id || '';
    });
  }, [snapshot.sources, lgTargets]);

  const selectedSource = snapshot.sources.find((source) => source.id === selectedSourceId);
  const selectedTarget = lgTargets.find((target) => target.id === selectedTargetId);
  const sourceOnline = !!selectedSource && isOnline(selectedSource.status);
  const canRun = sourceOnline && !!selectedTargetId && !running;

  async function runTool() {
    if (!canRun || !selectedSource) return;
    const sourceName = selectedSource.display_name;
    const targetName = selectedTarget?.display_name ?? selectedTargetId;
    setRunning(true);
    setTerminalOutput(`✓ 测试发起点：${sourceName}\n$ ${selectedTool} ${targetName} --from ${sourceName}\n正在等待检测结果...`);
    try {
      const response = await fetch('/api/public/lg/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ tool: selectedTool, source_id: selectedSourceId, target_id: selectedTargetId }),
      });

      if (response.status !== 202) {
        setTerminalOutput(`检测任务创建失败：HTTP ${response.status}\n${await response.text()}`);
        return;
      }
      const payload = await response.json() as { job_id?: string };
      if (!payload.job_id) {
        setTerminalOutput('检测任务创建失败：未收到任务编号。');
        return;
      }

      for (let second = 0; second < 30; second += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
        const resultResponse = await fetch(`/api/public/lg/result?job_id=${encodeURIComponent(payload.job_id)}`, { headers: { Accept: 'application/json' } });
        const result = await resultResponse.json() as LGResult;
        if (result.status === 'completed' || result.status === 'failed') {
          setTerminalOutput(`✓ 测试发起点：${sourceName}\n# 检测编号：${payload.job_id} · 状态：${result.status}\n${result.output || ''}${result.error ? `\n错误：${result.error}` : ''}`);
          return;
        }
        setTerminalOutput(`✓ 测试发起点：${sourceName}\n# 检测编号：${payload.job_id} · 状态：${result.status}\n${sourceName} 正在检测... ${second + 1}s`);
      }
      setTerminalOutput(`✓ 测试发起点：${sourceName}\n# 检测超时（30s 内暂无结果）\n请稍后重试，或换一个发起点。`);
    } catch (error) {
      setTerminalOutput(`检测请求失败：${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setRunning(false);
    }
  }

  const runDisabledHint = !sourceOnline
    ? '请先在左侧选择一个可用发起点'
    : !selectedTargetId
      ? '请选择一个目标'
      : '';

  return (
    <section className="lg-console" aria-label="Looking Glass 工具台">
      <aside className="lg-sidebar">
        <div className="lg-sidebar__head">
          <h2 className="lg-sidebar__title">源节点</h2>
          <span className="lg-sidebar__meta">{onlineCount} ONLINE</span>
        </div>
        <div className="lg-region-list">
          {regionGroups.map((group) => (
            <div className="lg-region" key={group.region}>
              <div className="lg-region__title">{group.region}</div>
              <div className="lg-region__nodes">
                {group.nodes.map((node) => {
                  const online = isOnline(node.status);
                  return (
                    <button
                      className={`lg-node${selectedSourceId === node.id ? ' is-active' : ''}${online ? '' : ' is-offline'}`}
                      type="button"
                      key={node.id}
                      onClick={() => online && setSelectedSourceId(node.id)}
                      disabled={!online}
                      title={online ? '' : `${node.display_name} 暂不可用（${node.status}）`}
                    >
                      <span className={`lg-node-dot ${nodeTone(node.status)}`} />
                      <span className="lg-node__name">{node.display_name}</span>
                      <span className="lg-node__lat">{node.tags[0] ?? '—'}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {snapshot.sources.length === 0 && (
            <p className="lg-empty">暂时没有可用发起点，请稍后再试。</p>
          )}
        </div>
      </aside>

      <div className="lg-workbench">
        <div className="lg-workbench__head">
          <h2 className="lg-workbench__title">探测工具台</h2>
          <span className="lg-workbench__meta">
            {(selectedSource?.region?.toUpperCase()) ?? '—'} → {selectedTarget?.display_name ?? '?'}
          </span>
        </div>

        <ol className="lg-stepper" aria-label="操作步骤">
          <li className={`lg-step${selectedSourceId ? ' is-done' : ''}`}>
            <span className="lg-step__num">1</span>
            <span className="lg-step__label">源节点</span>
          </li>
          <li className={`lg-step${selectedTool ? ' is-done' : ''}`}>
            <span className="lg-step__num">2</span>
            <span className="lg-step__label">探测工具</span>
          </li>
          <li className={`lg-step${selectedTargetId ? ' is-done' : ''}`}>
            <span className="lg-step__num">3</span>
            <span className="lg-step__label">选择目标</span>
          </li>
          <li className={`lg-step${running ? ' is-current' : ''}`}>
            <span className="lg-step__num">4</span>
            <span className="lg-step__label">执行</span>
          </li>
        </ol>

        <div className="lg-actions" role="radiogroup" aria-label="选择探测工具">
          {([
            { id: 'ping', name: 'Ping', desc: 'ICMP echo · 平均延迟' },
            { id: 'traceroute', name: 'Traceroute', desc: '逐跳路径' },
            { id: 'mtr', name: 'MTR', desc: '丢包采样' },
            { id: 'nexttrace', name: 'Nexttrace', desc: '路由可视化' },
          ] as { id: LGTool; name: string; desc: string }[]).map((tool) => (
            <button
              key={tool.id}
              type="button"
              role="radio"
              aria-checked={selectedTool === tool.id}
              className={`lg-action${selectedTool === tool.id ? ' is-active' : ''}`}
              onClick={() => setSelectedTool(tool.id)}
            >
              <span className="lg-action__icon" aria-hidden="true">
                {tool.id === 'ping' && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h3l3-9 6 18 3-9h3" /></svg>
                )}
                {tool.id === 'traceroute' && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18" /><circle cx="6" cy="6" r="1.6" fill="currentColor" /><circle cx="11" cy="12" r="1.6" fill="currentColor" /><circle cx="16" cy="18" r="1.6" fill="currentColor" /></svg>
                )}
                {tool.id === 'mtr' && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3v18" strokeLinecap="round" /></svg>
                )}
                {tool.id === 'nexttrace' && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 17V7l8-3 8 3v10l-8 3-8-3Z" /><path d="M4 7l8 3 8-3M12 10v10" /></svg>
                )}
              </span>
              <span className="lg-action__name">{tool.name}</span>
              <span className="lg-action__desc">{tool.desc}</span>
            </button>
          ))}
        </div>

        <div className="lg-target-row">
          <label className="lg-target-input">
            <span className="lg-target-input__label">目标</span>
            <select
              value={selectedTargetId}
              aria-label="选择目标"
              onChange={(event) => setSelectedTargetId(event.target.value)}
            >
              {lgTargets.map((target) => (
                <option value={target.id} key={target.id}>{target.display_name}</option>
              ))}
            </select>
          </label>
          <button
            className="lg-run"
            type="button"
            onClick={runTool}
            disabled={!canRun}
            title={runDisabledHint}
          >
            <span className="lg-run__icon" aria-hidden="true">
              {running ? (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
              ) : (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              )}
            </span>
            {running ? '检测中' : '运行'}
          </button>
        </div>

        <div className="lg-terminal">
          <div className="lg-terminal__top">
            <span className="lg-terminal__dot lg-terminal__dot--r" />
            <span className="lg-terminal__dot lg-terminal__dot--y" />
            <span className="lg-terminal__dot lg-terminal__dot--g" />
            <span className="lg-terminal__title">
              {selectedSource?.display_name ?? 'NODE'} <span className="lg-terminal__sep">→</span> {selectedTarget?.display_name ?? 'TARGET'} · {selectedTool.toUpperCase()}
            </span>
          </div>
          <pre className="lg-terminal__body">{renderTerminalLines(terminalOutput)}</pre>
        </div>
      </div>
    </section>
  );
}
