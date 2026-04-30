import { useEffect, useMemo, useState } from 'react';
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

function renderTerminalOutput(value: string) {
  const [firstLine, ...restLines] = value.split('\n');
  const className = firstLine.startsWith('✓') ? 'lg-terminal-success' : firstLine.startsWith('⚠') ? 'lg-terminal-warning' : '';
  if (!className) return value;
  return (
    <>
      <span className={className}>{firstLine}</span>
      {restLines.length > 0 && `\n${restLines.join('\n')}`}
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
    <section className="looking-glass-console" aria-label="Looking Glass 工具台">
      <aside className="lg-sidebar">
        <div className="lg-sidebar__head">
          <p className="status-kicker">Nodes</p>
          <h2>发起点</h2>
          <span>{origin === 'api' ? '选择一个可用发起点开始检测。' : '正在同步可用发起点。'}</span>
        </div>
        <div className="lg-region-list">
          {regionGroups.map((group) => (
            <article className="lg-region" key={group.region}>
              <div className="lg-region__title">
                <strong>{group.region}</strong>
                <small>{group.summary}</small>
              </div>
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
                    <span>
                      <strong>{node.display_name}</strong>
                      <small>{node.tags.join(' / ') || 'public'} · {node.status}</small>
                    </span>
                  </button>
                );
              })}
            </article>
          ))}
          {snapshot.sources.length === 0 && (
            <p className="lg-empty">暂时没有可用发起点，请稍后再试。</p>
          )}
        </div>
      </aside>

      <div className="lg-workbench">
        <div className="lg-toolbar">
          <label>
            <span>工具</span>
            <select value={selectedTool} aria-label="选择工具" onChange={(event) => setSelectedTool(event.target.value as LGTool)}>
              <option value="ping">Ping</option>
              <option value="tcping">TCPing</option>
              <option value="mtr">MTR</option>
              <option value="nexttrace">Nexttrace</option>
              <option value="traceroute">Traceroute</option>
            </select>
          </label>
          <label className="lg-target">
            <span>目标</span>
            <select value={selectedTargetId} aria-label="选择目标" onChange={(event) => setSelectedTargetId(event.target.value)}>
              {lgTargets.map((target) => (
                <option value={target.id} key={target.id}>{target.display_name}</option>
              ))}
            </select>
          </label>
          <label className="lg-source-readonly">
            <span>发起点</span>
            <strong>{selectedSource?.display_name ?? '未选择'}</strong>
          </label>
          <button
            className="lg-run"
            type="button"
            onClick={runTool}
            disabled={!canRun}
            title={runDisabledHint}
          >
            {running ? '检测中…' : '开始检测'}
          </button>
        </div>

        <div className="lg-summary-grid">
          <article>
            <span>发起点</span>
            <strong>{selectedSource?.display_name ?? '未选择'}</strong>
            <small>{selectedSource ? `${selectedSource.region} · ${selectedSource.tags.join(' / ') || 'public'}` : '暂无节点'}</small>
          </article>
          <article>
            <span>目标</span>
            <strong>{selectedTarget?.display_name ?? '未选择'}</strong>
            <small>{selectedTarget ? `${selectedTarget.region} · ${selectedTarget.tags.join(' / ') || 'public'}` : '暂无目标'}</small>
          </article>
          <article>
            <span>执行方式</span>
            <strong>{running ? '运行中' : '即时检测'}</strong>
            <small>结果会在下方窗口更新</small>
          </article>
        </div>

        <div className="lg-terminal-card">
          <div className="lg-terminal-top">
            <span />
            <span />
            <span />
            <strong>检测结果</strong>
          </div>
          <pre>{renderTerminalOutput(terminalOutput)}</pre>
        </div>
      </div>
    </section>
  );
}
