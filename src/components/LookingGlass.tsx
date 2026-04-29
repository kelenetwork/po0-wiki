import { useEffect, useState } from 'react';
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

function defaultSourceId(sources: PublicProbeItem[]) {
  return sources.find((source) => source.status === 'online' || source.status === 'ok')?.id ?? sources[0]?.id ?? '';
}

function renderTerminalOutput(value: string) {
  const [firstLine, ...restLines] = value.split('\n');
  if (!firstLine.startsWith('⚠')) return value;
  return (
    <>
      <span className="lg-terminal-warning">{firstLine}</span>
      {restLines.length > 0 && `\n${restLines.join('\n')}`}
    </>
  );
}

const initialTerminal = [
  '⚠ 测试发起点：Hub (上海) — 不是你选的 src-item。',
  '   如需从源节点发起，请等 agent dispatch 模式上线。',
  '$ 选择源节点、目标和工具后点击 Run',
  'Looking Glass 已接入后端 /api/public/lg/run。',
  '当前版本使用 Hub-local fallback 执行，并在输出中标注真实执行位置。',
].join('\n');

export default function LookingGlass() {
  const { snapshot, origin } = usePublicProbeSnapshot();
  const regionGroups = groupSources(snapshot.sources);
  const [selectedSourceId, setSelectedSourceId] = useState(defaultSourceId(snapshot.sources));
  const [selectedTargetId, setSelectedTargetId] = useState(snapshot.targets[0]?.id ?? '');
  const [selectedTool, setSelectedTool] = useState<LGTool>('mtr');
  const [terminalOutput, setTerminalOutput] = useState(initialTerminal);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    setSelectedSourceId((current) => current || defaultSourceId(snapshot.sources));
    setSelectedTargetId((current) => current || snapshot.targets[0]?.id || '');
  }, [snapshot.sources, snapshot.targets]);

  const selectedSource = snapshot.sources.find((source) => source.id === selectedSourceId);
  const selectedTarget = snapshot.targets.find((target) => target.id === selectedTargetId);

  async function runTool() {
    if (!selectedSourceId || !selectedTargetId || running) return;
    setRunning(true);
    setTerminalOutput(`⚠ 测试发起点：Hub (上海) — 不是你选的 src-item (${selectedSource?.display_name ?? selectedSourceId})。\n   如需从源节点发起，请等 agent dispatch 模式上线。\n$ ${selectedTool} ${selectedTarget?.display_name ?? selectedTargetId} --from ${selectedSource?.display_name ?? selectedSourceId}\nRunning...`);
    try {
      const response = await fetch('/api/public/lg/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/plain' },
        body: JSON.stringify({ tool: selectedTool, source_id: selectedSourceId, target_id: selectedTargetId }),
      });
      const text = await response.text();
      setTerminalOutput(text || `请求完成，但后端没有返回输出。HTTP ${response.status}`);
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

        <div className="lg-mode-banner" role="note">
          <strong>Hub-local 模式</strong>
          <span>当前所有测试均从 wiki.kele.my 服务器发起，不会从左侧所选源节点执行。</span>
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
            <strong>{running ? '运行中' : 'Hub-local fallback'}</strong>
            <small>后端本机执行，非 agent dispatch</small>
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
