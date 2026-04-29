import { useEffect, useMemo, useState } from 'react';
import './LookingGlass.css';
import { PublicProbeItem, usePublicProbeSnapshot } from './probeSnapshot';

type RegionGroup = {
  region: string;
  summary: string;
  nodes: PublicProbeItem[];
};

type LGTool = 'ping' | 'tcping' | 'mtr' | 'nexttrace' | 'traceroute';

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
  if (status === 'online' || status === 'ok') return 'online';
  if (status === 'warn' || status === 'busy') return 'busy';
  return 'standby';
}

const hubSource: PublicProbeItem = {
  id: 'hub',
  display_name: 'Hub (上海·wiki.kele.my 服务器)',
  region: 'Hub-local',
  tags: ['上海', '服务器本机'],
  status: 'online',
  updated_at: '',
};

function defaultSourceId(sources: PublicProbeItem[]) {
  return sources.find((source) => source.status === 'online' || source.status === 'ok')?.id ?? sources[0]?.id ?? 'hub';
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
  '$ 选择源节点、目标和工具后点击 Run',
  '选择 Hub 会从 wiki.kele.my 上海服务器本机执行。',
  '选择真实源节点会下发到该 agent 执行并轮询结果。',
].join('\n');

export default function LookingGlass() {
  const { snapshot, origin } = usePublicProbeSnapshot();
  const regionGroups = groupSources(snapshot.sources);
  const selectableSources = useMemo(() => [hubSource, ...snapshot.sources], [snapshot.sources]);
  const [selectedSourceId, setSelectedSourceId] = useState(defaultSourceId(snapshot.sources));
  const [selectedTargetId, setSelectedTargetId] = useState(snapshot.targets[0]?.id ?? '');
  const [selectedTool, setSelectedTool] = useState<LGTool>('mtr');
  const [terminalOutput, setTerminalOutput] = useState(initialTerminal);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    setSelectedSourceId((current) => current || defaultSourceId(snapshot.sources));
    setSelectedTargetId((current) => current || snapshot.targets[0]?.id || '');
  }, [snapshot.sources, snapshot.targets]);

  const selectedSource = selectableSources.find((source) => source.id === selectedSourceId);
  const selectedTarget = snapshot.targets.find((target) => target.id === selectedTargetId);
  const dispatchMode = selectedSourceId !== 'hub';

  async function runTool() {
    if (!selectedSourceId || !selectedTargetId || running) return;
    const sourceName = selectedSource?.display_name ?? selectedSourceId;
    const targetName = selectedTarget?.display_name ?? selectedTargetId;
    setRunning(true);
    setTerminalOutput(dispatchMode
      ? `✓ 测试发起点：你的源节点 ${sourceName}\n$ ${selectedTool} ${targetName} --from ${sourceName}\n等待 ${sourceName} 执行中...`
      : `⚠ 测试发起点：Hub (上海) — Hub-local fallback。\n$ ${selectedTool} ${targetName} --from Hub\nRunning...`);
    try {
      const response = await fetch('/api/public/lg/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: dispatchMode ? 'application/json' : 'text/plain' },
        body: JSON.stringify({ tool: selectedTool, source_id: selectedSourceId, target_id: selectedTargetId }),
      });

      if (!dispatchMode) {
        const text = await response.text();
        setTerminalOutput(text || `请求完成，但后端没有返回输出。HTTP ${response.status}`);
        return;
      }

      if (response.status !== 202) {
        setTerminalOutput(`Looking Glass dispatch 创建失败：HTTP ${response.status}\n${await response.text()}`);
        return;
      }
      const payload = await response.json() as { job_id?: string };
      if (!payload.job_id) {
        setTerminalOutput('Looking Glass dispatch 创建失败：后端没有返回 job_id。');
        return;
      }

      for (let second = 0; second < 30; second += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
        const resultResponse = await fetch(`/api/public/lg/result?job_id=${encodeURIComponent(payload.job_id)}`, { headers: { Accept: 'application/json' } });
        const result = await resultResponse.json() as LGResult;
        if (result.status === 'completed' || result.status === 'failed') {
          setTerminalOutput(`✓ 测试发起点：你的源节点 ${sourceName}\n# job_id: ${payload.job_id} · status=${result.status}\n${result.output || ''}${result.error ? `\nerror: ${result.error}` : ''}`);
          return;
        }
        setTerminalOutput(`✓ 测试发起点：你的源节点 ${sourceName}\n# job_id: ${payload.job_id} · status=${result.status}\n等待 ${sourceName} 执行中... ${second + 1}s`);
      }
      setTerminalOutput(`✓ 测试发起点：你的源节点 ${sourceName}\n# job timed out locally after 30s\n等待 ${sourceName} 执行超时，请稍后刷新结果或检查 agent 日志。`);
    } catch (error) {
      setTerminalOutput(`Looking Glass 请求失败：${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="looking-glass-console" aria-label="Looking Glass 工具台">
      <aside className="lg-sidebar">
        <div className="lg-sidebar__head">
          <p className="status-kicker">Source Nodes</p>
          <h2>节点列表</h2>
          <span>{origin === 'api' ? '来自 Public Snapshot API。' : 'API 不可用，使用安全 mock。'}</span>
        </div>
        <div className="lg-region-list">
          <article className="lg-region">
            <div className="lg-region__title">
              <strong>Hub-local</strong>
              <small>明确从上海服务器本机执行</small>
            </div>
            <button className={`lg-node${selectedSourceId === 'hub' ? ' is-active' : ''}`} type="button" onClick={() => setSelectedSourceId('hub')}>
              <span className="lg-node-dot online" />
              <span>
                <strong>{hubSource.display_name}</strong>
                <small>Hub-local fallback · 手动选择</small>
              </span>
            </button>
          </article>
          {regionGroups.map((group) => (
            <article className="lg-region" key={group.region}>
              <div className="lg-region__title">
                <strong>{group.region}</strong>
                <small>{group.summary}</small>
              </div>
              {group.nodes.map((node) => (
                <button className={`lg-node${selectedSourceId === node.id ? ' is-active' : ''}`} type="button" key={node.id} onClick={() => setSelectedSourceId(node.id)}>
                  <span className={`lg-node-dot ${nodeTone(node.status)}`} />
                  <span>
                    <strong>{node.display_name}</strong>
                    <small>{node.tags.join(' / ') || 'public'} · {node.status}</small>
                  </span>
                </button>
              ))}
            </article>
          ))}
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
              {snapshot.targets.map((target) => (
                <option value={target.id} key={target.id}>{target.display_name}</option>
              ))}
            </select>
          </label>
          <label className="lg-source-readonly">
            <span>源节点</span>
            <strong>{selectedSource?.display_name ?? '未选择'}</strong>
          </label>
          <button className="lg-run" type="button" onClick={runTool} disabled={running || !selectedSourceId || !selectedTargetId}>{running ? 'Running…' : 'Run'}</button>
        </div>

        <div className={`lg-mode-banner${dispatchMode ? ' lg-mode-banner--dispatch' : ''}`} role="note">
          <strong>{dispatchMode ? 'Agent dispatch 模式' : 'Hub-local 模式'}</strong>
          <span>{dispatchMode ? `测试将下发到 ${selectedSource?.display_name ?? selectedSourceId} 执行。` : '当前测试从 wiki.kele.my 上海服务器本机发起。'}</span>
        </div>

        <div className="lg-summary-grid">
          <article>
            <span>当前源</span>
            <strong>{selectedSource?.display_name ?? '未选择'}</strong>
            <small>{selectedSource ? `${selectedSource.region} · ${selectedSource.tags.join(' / ') || 'public'}` : '暂无节点'}</small>
          </article>
          <article>
            <span>目标</span>
            <strong>{selectedTarget?.display_name ?? '未选择'}</strong>
            <small>{selectedTarget ? `${selectedTarget.region} · ${selectedTarget.tags.join(' / ') || 'public'}` : '暂无目标'}</small>
          </article>
          <article>
            <span>状态</span>
            <strong>{running ? '运行中' : dispatchMode ? 'Agent dispatch' : 'Hub-local fallback'}</strong>
            <small>{dispatchMode ? '源节点 agent 执行，轮询结果' : '后端本机执行'}</small>
          </article>
        </div>

        <div className="lg-terminal-card">
          <div className="lg-terminal-top">
            <span />
            <span />
            <span />
            <strong>terminal · live output</strong>
          </div>
          <pre>{renderTerminalOutput(terminalOutput)}</pre>
        </div>
      </div>
    </section>
  );
}
