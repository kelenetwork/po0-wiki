import type { FormEvent, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import './AdminApp.css';

type AdminPage = 'home' | 'sources' | 'targets' | 'checks' | 'agents';

type Source = {
  id: string;
  display_name: string;
  region: string;
  tags: string[];
  status: string;
  updated_at: string;
};

type Target = Source & {
  host: string;
  port: number;
};

type Check = {
  id: string;
  display_name: string;
  source_id: string;
  target_id: string;
  tags: string[];
  status: string;
  latency_ms: number;
  loss_pct: number;
  jitter_ms: number;
  interval_seconds: number;
  enabled: boolean;
  updated_at: string;
};

type Agent = {
  id: string;
  source_id: string;
  token_prefix: string;
  hostname?: string;
  version?: string;
  last_seen_at?: string;
  last_reported_at?: string;
};

type InstallPayload = {
  agent_id: string;
  token: string;
  hub_url: string;
  systemd_unit: string;
  config_json: string;
};

type AdminAppProps = {
  page: AdminPage;
};

const TOKEN_KEY = 'wiki_admin_token';
const navItems: Array<{ page: AdminPage; label: string; href: string }> = [
  { page: 'home', label: '概览', href: '/admin' },
  { page: 'sources', label: '源机器', href: '/admin/sources' },
  { page: 'targets', label: '目标', href: '/admin/targets' },
  { page: 'checks', label: '任务', href: '/admin/checks' },
  { page: 'agents', label: 'Agents', href: '/admin/agents' },
];

const blankSource = { id: '', display_name: '', region: '', tags: '' };
const blankTarget = { id: '', display_name: '', region: '', tags: '', host: '', port: '443' };
const blankCheck = { id: '', display_name: '', source_id: '', target_id: '', tags: '', interval_seconds: '30', enabled: true };

function tagsFromText(value: string) {
  return value.split(',').map((tag) => tag.trim()).filter(Boolean);
}

function tagsToText(tags: string[] | undefined) {
  return (tags ?? []).join(', ');
}

function metric(check: Check) {
  const latency = check.latency_ms ? `${check.latency_ms}ms` : '待上报';
  return `${latency} / loss ${check.loss_pct}% / jitter ${check.jitter_ms}ms`;
}

function lastSeen(value?: string) {
  return value || '—';
}

export default function AdminApp({ page }: AdminAppProps) {
  const [token, setToken] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [authReady, setAuthReady] = useState(false);
  const [notice, setNotice] = useState('');
  const [sources, setSources] = useState<Source[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [checks, setChecks] = useState<Check[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [sourceForm, setSourceForm] = useState(blankSource);
  const [targetForm, setTargetForm] = useState(blankTarget);
  const [checkForm, setCheckForm] = useState(blankCheck);
  const [editingSourceId, setEditingSourceId] = useState('');
  const [editingTargetId, setEditingTargetId] = useState('');
  const [editingCheckId, setEditingCheckId] = useState('');
  const [agentID, setAgentID] = useState('');
  const [secret, setSecret] = useState<{ title: string; body: string } | null>(null);
  const [install, setInstall] = useState<InstallPayload | null>(null);

  const sourceName = useMemo(() => new Map(sources.map((item) => [item.id, item.display_name])), [sources]);
  const targetName = useMemo(() => new Map(targets.map((item) => [item.id, item.display_name])), [targets]);

  async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
    });
    if (response.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      setToken('');
      setTokenInput('');
      setNotice('Admin token 已失效，请重新输入。');
      throw new Error('unauthorized');
    }
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `请求失败：${response.status}`);
    }
    return data;
  }

  async function loadAll() {
    if (!token) return;
    const [sourceData, targetData, checkData, agentData] = await Promise.all([
      adminFetch<{ sources: Source[] }>('/api/admin/sources'),
      adminFetch<{ targets: Target[] }>('/api/admin/targets'),
      adminFetch<{ checks: Check[] }>('/api/admin/checks'),
      adminFetch<{ agents: Agent[] }>('/api/admin/agents'),
    ]);
    setSources(sourceData.sources ?? []);
    setTargets(targetData.targets ?? []);
    setChecks(checkData.checks ?? []);
    setAgents(agentData.agents ?? []);
  }

  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY) ?? '';
    setToken(saved);
    setTokenInput(saved);
    setAuthReady(true);
  }, []);

  useEffect(() => {
    if (!authReady || !token) return;
    loadAll().catch((error) => {
      if (error.message !== 'unauthorized') setNotice(error.message);
    });
  }, [authReady, token]);

  function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextToken = tokenInput.trim();
    if (!nextToken) return;
    localStorage.setItem(TOKEN_KEY, nextToken);
    setToken(nextToken);
    setNotice('Token 已保存，本页请求将自动携带 Authorization Bearer。');
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken('');
    setTokenInput('');
    setNotice('已清除本地 admin token。');
  }

  async function saveSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const editing = Boolean(editingSourceId);
    const body = JSON.stringify({ display_name: sourceForm.display_name, region: sourceForm.region, tags: tagsFromText(sourceForm.tags), ...(editing ? {} : { id: sourceForm.id }) });
    await adminFetch(editing ? `/api/admin/sources/${encodeURIComponent(editingSourceId)}` : '/api/admin/sources', { method: editing ? 'PUT' : 'POST', body });
    setSourceForm(blankSource);
    setEditingSourceId('');
    setNotice(editing ? '源机器已更新。' : '源机器已创建。');
    await loadAll();
  }

  async function saveTarget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const editing = Boolean(editingTargetId);
    const body = JSON.stringify({ id: targetForm.id, display_name: targetForm.display_name, region: targetForm.region, tags: tagsFromText(targetForm.tags), host: targetForm.host, port: Number(targetForm.port), status: 'online' });
    await adminFetch(editing ? `/api/admin/targets/${encodeURIComponent(editingTargetId)}` : '/api/admin/targets', { method: editing ? 'PUT' : 'POST', body });
    setTargetForm(blankTarget);
    setEditingTargetId('');
    setNotice(editing ? '目标已更新。' : '目标已创建。');
    await loadAll();
  }

  async function saveCheck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const editing = Boolean(editingCheckId);
    const body = JSON.stringify({ id: checkForm.id, display_name: checkForm.display_name, source_id: checkForm.source_id, target_id: checkForm.target_id, tags: tagsFromText(checkForm.tags), interval_seconds: Number(checkForm.interval_seconds), enabled: checkForm.enabled, status: 'ok' });
    await adminFetch(editing ? `/api/admin/checks/${encodeURIComponent(editingCheckId)}` : '/api/admin/checks', { method: editing ? 'PUT' : 'POST', body });
    setCheckForm(blankCheck);
    setEditingCheckId('');
    setNotice(editing ? '任务已更新。' : '任务已创建。');
    await loadAll();
  }

  async function deleteItem(resource: 'sources' | 'targets' | 'checks' | 'agents', id: string, onDeleted: () => void) {
    if (!confirm('确认删除？')) return;
    try {
      await adminFetch(`/api/admin/${resource}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '删除失败');
      return;
    }
    onDeleted();
    setNotice('已删除。');
  }

  async function createAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const created = await adminFetch<{ token: string }>('/api/admin/agents', { method: 'POST', body: JSON.stringify({ id: agentID }) });
    setSecret({ title: `${agentID} 初始 token`, body: created.token });
    setAgentID('');
    await loadAll();
  }

  async function resetToken(id: string) {
    const data = await adminFetch<{ token: string }>(`/api/admin/agents/${encodeURIComponent(id)}/reset-token`, { method: 'POST', body: '{}' });
    setSecret({ title: `${id} 新 token（仅本次显示）`, body: data.token });
    setInstall(null);
    await loadAll();
  }

  async function showInstall(id: string) {
    const data = await adminFetch<InstallPayload>(`/api/admin/agents/${encodeURIComponent(id)}/install`);
    setInstall(data);
    setSecret(null);
  }

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
    setNotice('已复制到剪贴板。');
  }

  if (!authReady) return <section className="admin-shell">加载中…</section>;

  if (!token) {
    return (
      <section className="admin-shell admin-login">
        <p className="admin-kicker">Private Admin</p>
        <h1>Wiki Probe Admin</h1>
        <p>输入后台 token 后仅保存到本机 localStorage，不写入 URL 或前端 bundle。</p>
        <form className="admin-card admin-form" onSubmit={login}>
          <label>Admin Token<input type="password" value={tokenInput} onChange={(event) => setTokenInput(event.target.value)} autoComplete="off" /></label>
          <button type="submit">进入后台</button>
        </form>
        {notice && <p className="admin-notice">{notice}</p>}
      </section>
    );
  }

  return (
    <section className="admin-shell">
      <header className="admin-header">
        <div><p className="admin-kicker">Wiki Probe Admin</p><h1>{navItems.find((item) => item.page === page)?.label}</h1></div>
        <button className="admin-ghost" onClick={logout}>退出登录</button>
      </header>
      <nav className="admin-tabs">{navItems.map((item) => <a className={item.page === page ? 'active' : ''} href={item.href} key={item.page}>{item.label}</a>)}</nav>
      {notice && <p className="admin-notice">{notice}</p>}

      {page === 'home' && <Overview sources={sources} targets={targets} checks={checks} agents={agents} />}
      {page === 'sources' && <SourcesPage sources={sources} form={sourceForm} setForm={setSourceForm} editingId={editingSourceId} setEditingId={setEditingSourceId} onSave={saveSource} onDelete={(id) => deleteItem('sources', id, () => { setSources((items) => items.filter((item) => item.id !== id)); if (editingSourceId === id) { setSourceForm(blankSource); setEditingSourceId(''); } })} />}
      {page === 'targets' && <TargetsPage targets={targets} form={targetForm} setForm={setTargetForm} editingId={editingTargetId} setEditingId={setEditingTargetId} onSave={saveTarget} onDelete={(id) => deleteItem('targets', id, () => { setTargets((items) => items.filter((item) => item.id !== id)); if (editingTargetId === id) { setTargetForm(blankTarget); setEditingTargetId(''); } })} />}
      {page === 'checks' && <ChecksPage checks={checks} sources={sources} targets={targets} form={checkForm} setForm={setCheckForm} editingId={editingCheckId} setEditingId={setEditingCheckId} onSave={saveCheck} onDelete={(id) => deleteItem('checks', id, () => { setChecks((items) => items.filter((item) => item.id !== id)); if (editingCheckId === id) { setCheckForm(blankCheck); setEditingCheckId(''); } })} sourceName={sourceName} targetName={targetName} />}
      {page === 'agents' && <AgentsPage agents={agents} sources={sources} agentID={agentID} setAgentID={setAgentID} onCreate={createAgent} onReset={resetToken} onInstall={showInstall} onDelete={(id) => deleteItem('agents', id, () => setAgents((items) => items.filter((item) => item.id !== id)))} />}

      {secret && <Modal title={secret.title} onClose={() => setSecret(null)}><pre>{secret.body}</pre><button onClick={() => copyText(secret.body)}>复制 token</button></Modal>}
      {install && <InstallModal install={install} onClose={() => setInstall(null)} onCopy={copyText} />}
    </section>
  );
}

function Overview({ sources, targets, checks, agents }: { sources: Source[]; targets: Target[]; checks: Check[]; agents: Agent[] }) {
  return <div className="admin-grid">{[
    ['源机器', sources.length, '/admin/sources'], ['目标', targets.length, '/admin/targets'], ['任务', checks.length, '/admin/checks'], ['Agents', agents.length, '/admin/agents'],
  ].map(([label, count, href]) => <a className="admin-card admin-stat" href={String(href)} key={String(label)}><span>{label}</span><strong>{count}</strong></a>)}</div>;
}

function SourcesPage({ sources, form, setForm, editingId, setEditingId, onSave, onDelete }: { sources: Source[]; form: typeof blankSource; setForm: (form: typeof blankSource) => void; editingId: string; setEditingId: (id: string) => void; onSave: (event: FormEvent<HTMLFormElement>) => void; onDelete: (id: string) => void }) {
  const cancelEdit = () => { setForm(blankSource); setEditingId(''); };
  return <><form className="admin-card admin-form" onSubmit={onSave}>{editingId && <EditBanner id={editingId} onCancel={cancelEdit} />}<FormInput label="ID" value={form.id} disabled={Boolean(editingId)} onChange={(id) => setForm({ ...form, id })} /><FormInput label="显示名" value={form.display_name} onChange={(display_name) => setForm({ ...form, display_name })} /><FormInput label="区域" value={form.region} onChange={(region) => setForm({ ...form, region })} /><FormInput label="标签（逗号分隔）" value={form.tags} onChange={(tags) => setForm({ ...form, tags })} /><button>保存源机器</button></form><table><thead><tr><th>ID</th><th>显示名</th><th>区域</th><th>标签</th><th>状态</th><th>最近活动时间</th><th>操作</th></tr></thead><tbody>{sources.map((item) => <tr key={item.id}><td>{empty(item.id)}</td><td>{empty(item.display_name)}</td><td>{empty(item.region)}</td><td>{empty(tagsToText(item.tags))}</td><td>{empty(item.status)}</td><td>{empty(item.updated_at)}</td><td><button onClick={() => { setForm({ id: item.id, display_name: item.display_name, region: item.region, tags: tagsToText(item.tags) }); setEditingId(item.id); }}>编辑</button>{editingId === item.id && <button onClick={cancelEdit}>取消编辑</button>}<button className="danger" onClick={() => onDelete(item.id)}>删除</button></td></tr>)}</tbody></table></>;
}

function TargetsPage({ targets, form, setForm, editingId, setEditingId, onSave, onDelete }: { targets: Target[]; form: typeof blankTarget; setForm: (form: typeof blankTarget) => void; editingId: string; setEditingId: (id: string) => void; onSave: (event: FormEvent<HTMLFormElement>) => void; onDelete: (id: string) => void }) {
  const cancelEdit = () => { setForm(blankTarget); setEditingId(''); };
  return <><form className="admin-card admin-form" onSubmit={onSave}>{editingId && <EditBanner id={editingId} onCancel={cancelEdit} />}<FormInput label="ID" value={form.id} disabled={Boolean(editingId)} onChange={(id) => setForm({ ...form, id })} /><FormInput label="显示名" value={form.display_name} onChange={(display_name) => setForm({ ...form, display_name })} /><FormInput label="区域" value={form.region} onChange={(region) => setForm({ ...form, region })} /><FormInput label="标签（逗号分隔）" value={form.tags} onChange={(tags) => setForm({ ...form, tags })} /><FormInput label="真实 Host（仅管理员可见）" value={form.host} onChange={(host) => setForm({ ...form, host })} /><FormInput label="真实端口" value={form.port} type="number" onChange={(port) => setForm({ ...form, port })} /><button>保存目标</button></form><table><thead><tr><th>ID</th><th>显示名</th><th>区域</th><th>标签</th><th>状态</th><th>真实 Host（仅管理员可见）</th><th>真实端口</th><th>最近活动时间</th><th>操作</th></tr></thead><tbody>{targets.map((item) => <tr key={item.id}><td>{empty(item.id)}</td><td>{empty(item.display_name)}</td><td>{empty(item.region)}</td><td>{empty(tagsToText(item.tags))}</td><td>{empty(item.status)}</td><td>{empty(item.host)}</td><td>{empty(item.port)}</td><td>{empty(item.updated_at)}</td><td><button onClick={() => { setForm({ id: item.id, display_name: item.display_name, region: item.region, tags: tagsToText(item.tags), host: item.host, port: String(item.port) }); setEditingId(item.id); }}>编辑</button>{editingId === item.id && <button onClick={cancelEdit}>取消编辑</button>}<button className="danger" onClick={() => onDelete(item.id)}>删除</button></td></tr>)}</tbody></table></>;
}

function ChecksPage({ checks, sources, targets, form, setForm, editingId, setEditingId, onSave, onDelete, sourceName, targetName }: { checks: Check[]; sources: Source[]; targets: Target[]; form: typeof blankCheck; setForm: (form: typeof blankCheck) => void; editingId: string; setEditingId: (id: string) => void; onSave: (event: FormEvent<HTMLFormElement>) => void; onDelete: (id: string) => void; sourceName: Map<string, string>; targetName: Map<string, string> }) {
  const cancelEdit = () => { setForm(blankCheck); setEditingId(''); };
  return <><form className="admin-card admin-form" onSubmit={onSave}>{editingId && <EditBanner id={editingId} onCancel={cancelEdit} />}<FormInput label="ID" value={form.id} disabled={Boolean(editingId)} onChange={(id) => setForm({ ...form, id })} /><FormInput label="显示名" value={form.display_name} onChange={(display_name) => setForm({ ...form, display_name })} /><Select label="源机器" value={form.source_id} options={sources} onChange={(source_id) => setForm({ ...form, source_id })} /><Select label="目标" value={form.target_id} options={targets} onChange={(target_id) => setForm({ ...form, target_id })} /><FormInput label="轮询间隔（秒）" value={form.interval_seconds} type="number" onChange={(interval_seconds) => setForm({ ...form, interval_seconds })} /><FormInput label="标签（逗号分隔）" value={form.tags} onChange={(tags) => setForm({ ...form, tags })} /><label className="admin-check"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} /> 启用</label><button>保存任务</button></form><table><thead><tr><th>ID</th><th>显示名</th><th>源机器</th><th>目标</th><th>轮询间隔</th><th>启用</th><th>标签</th><th>状态</th><th>最近指标</th><th>最近活动时间</th><th>操作</th></tr></thead><tbody>{checks.map((item) => <tr key={item.id}><td>{empty(item.id)}</td><td>{empty(item.display_name)}</td><td>{empty(sourceName.get(item.source_id) ?? item.source_id)}</td><td>{empty(targetName.get(item.target_id) ?? item.target_id)}</td><td>{empty(item.interval_seconds ? `${item.interval_seconds}s` : '')}</td><td>{item.enabled ? '是' : '否'}</td><td>{empty(tagsToText(item.tags))}</td><td>{empty(item.status)}</td><td>{metric(item)}</td><td>{empty(item.updated_at)}</td><td><button onClick={() => { setForm({ id: item.id, display_name: item.display_name, source_id: item.source_id, target_id: item.target_id, tags: tagsToText(item.tags), interval_seconds: String(item.interval_seconds), enabled: item.enabled }); setEditingId(item.id); }}>编辑</button>{editingId === item.id && <button onClick={cancelEdit}>取消编辑</button>}<button className="danger" onClick={() => onDelete(item.id)}>删除</button></td></tr>)}</tbody></table></>;
}

function AgentsPage({ agents, sources, agentID, setAgentID, onCreate, onReset, onInstall, onDelete }: { agents: Agent[]; sources: Source[]; agentID: string; setAgentID: (id: string) => void; onCreate: (event: FormEvent<HTMLFormElement>) => void; onReset: (id: string) => void; onInstall: (id: string) => void; onDelete: (id: string) => void }) {
  return <><form className="admin-card admin-form" onSubmit={onCreate}><label>源机器<select value={agentID} onChange={(event) => setAgentID(event.target.value)} required><option value="">选择源机器</option>{sources.map((item) => <option value={item.id} key={item.id}>{item.id} · {item.display_name}</option>)}</select></label><button>创建/重置 Agent</button></form><table><thead><tr><th>ID</th><th>Token 前缀</th><th>主机名</th><th>版本</th><th>最近活动时间</th><th>最近上报</th><th>操作</th></tr></thead><tbody>{agents.map((item) => <tr key={item.id}><td>{empty(item.id)}</td><td>{empty(item.token_prefix)}</td><td>{empty(item.hostname)}</td><td>{empty(item.version)}</td><td>{lastSeen(item.last_seen_at)}</td><td>{lastSeen(item.last_reported_at)}</td><td><button onClick={() => onReset(item.id)}>重置 Token</button><button onClick={() => onInstall(item.id)}>查看接入命令</button><button className="danger" onClick={() => onDelete(item.id)}>删除</button></td></tr>)}</tbody></table></>;
}

function EditBanner({ id, onCancel }: { id: string; onCancel: () => void }) {
  return <div className="admin-editing"><span>编辑中：{id}</span><button type="button" onClick={onCancel}>取消编辑</button></div>;
}

function FormInput({ label, value, onChange, type = 'text', disabled = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; disabled?: boolean }) {
  return <label>{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} required disabled={disabled} /></label>;
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: Array<{ id: string; display_name: string }>; onChange: (value: string) => void }) {
  return <label>{label}<select value={value} onChange={(event) => onChange(event.target.value)} required><option value="">请选择</option>{options.map((item) => <option value={item.id} key={item.id}>{item.id} · {item.display_name}</option>)}</select></label>;
}

function empty(value?: string | number) {
  return value === undefined || value === null || value === '' ? '—' : value;
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <div className="admin-modal"><div className="admin-modal-card"><header><h2>{title}</h2><button onClick={onClose}>关闭</button></header>{children}</div></div>;
}

function InstallModal({ install, onClose, onCopy }: { install: InstallPayload; onClose: () => void; onCopy: (text: string) => void }) {
  const command = `sudo install -m 0644 wiki-probe-agent.service /etc/systemd/system/wiki-probe-agent.service && sudo install -m 0600 wiki-probe-agent.json /etc/wiki-probe-agent.json && sudo systemctl daemon-reload && sudo systemctl enable --now wiki-probe-agent`;
  return <Modal title={`${install.agent_id} 接入命令（仅本次显示）`} onClose={onClose}><h3>systemd unit</h3><pre>{install.systemd_unit}</pre><button onClick={() => onCopy(install.systemd_unit)}>复制 unit</button><h3>config JSON</h3><pre>{install.config_json}</pre><button onClick={() => onCopy(install.config_json)}>复制 config</button><h3>一行命令</h3><pre>{command}</pre><button onClick={() => onCopy(command)}>复制命令</button></Modal>;
}
