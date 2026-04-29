import './LookingGlass.css';
import { PublicProbeItem, usePublicProbeSnapshot } from './probeSnapshot';

type RegionGroup = {
  region: string;
  summary: string;
  nodes: PublicProbeItem[];
};

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

const terminalLines = [
  '$ mtr --report Wiki Portal --from HK-Edge-01',
  'Start: public looking glass preview',
  '  1.|-- regional edge relay        0.0% loss   2.1 ms avg',
  '  2.|-- transit exchange           0.0% loss   8.4 ms avg',
  '  3.|-- protected service edge     0.0% loss  18.5 ms avg',
  'Report complete: static preview output',
];

export default function LookingGlass() {
  const { snapshot, origin } = usePublicProbeSnapshot();
  const regionGroups = groupSources(snapshot.sources);
  const firstSource = snapshot.sources[0];
  const firstTarget = snapshot.targets[0];

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
                <button className="lg-node" type="button" key={node.id}>
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
            <select defaultValue="mtr" aria-label="选择工具">
              <option value="ping">Ping</option>
              <option value="tcping">TCPing</option>
              <option value="mtr">MTR</option>
              <option value="nexttrace">Nexttrace</option>
              <option value="traceroute">Traceroute</option>
            </select>
          </label>
          <label className="lg-target">
            <span>目标</span>
            <select defaultValue={firstTarget?.id} aria-label="选择目标">
              {snapshot.targets.map((target) => (
                <option value={target.id} key={target.id}>{target.display_name}</option>
              ))}
            </select>
          </label>
          <button className="lg-run" type="button">Run</button>
        </div>

        <div className="lg-summary-grid">
          <article>
            <span>当前源</span>
            <strong>{firstSource?.display_name ?? '未选择'}</strong>
            <small>{firstSource ? `${firstSource.region} · ${firstSource.tags.join(' / ') || 'public'}` : '暂无节点'}</small>
          </article>
          <article>
            <span>目标</span>
            <strong>{firstTarget?.display_name ?? '未选择'}</strong>
            <small>{firstTarget ? `${firstTarget.region} · ${firstTarget.tags.join(' / ') || 'public'}` : '暂无目标'}</small>
          </article>
          <article>
            <span>状态</span>
            <strong>静态预览</strong>
            <small>未连接后端执行器</small>
          </article>
        </div>

        <div className="lg-terminal-card">
          <div className="lg-terminal-top">
            <span />
            <span />
            <span />
            <strong>terminal · mock output</strong>
          </div>
          <pre>{terminalLines.join('\n')}</pre>
        </div>
      </div>
    </section>
  );
}
