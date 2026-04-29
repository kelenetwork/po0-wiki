import type { FormEvent, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import './AdminApp.css';

type AdminPage = 'home' | 'sources' | 'targets' | 'checks' | 'agents';
type TargetKind = 'tcp' | 'icmp' | 'http' | 'https';
type DrawerMode = 'create' | 'edit';

type Source = { id: string; display_name: string; region: string; tags: string[]; status: string; updated_at: string };
type Target = Source & { kind: TargetKind; host: string; port: number; path: string };
type Check = { id: string; display_name: string; source_id: string; target_id: string; tags: string[]; status: string; latency_ms: number; loss_pct: number; jitter_ms: number; interval_seconds: number; enabled: boolean; last_error: string; updated_at: string };
type Agent = { id: string; source_id: string; token: string; token_prefix: string; hostname?: string; version?: string; last_seen_at?: string; last_reported_at?: string };
type InstallPayload = { agent_id: string; token: string; hub_url: string; systemd_unit: string; config_json: string; install_command: string; one_line: string; one_line_uninstall: string };

type SourceForm = { id: string; name: string; display_name: string; region: string; tags: string };
type TargetForm = SourceForm & { kind: TargetKind; host: string; port: string; path: string };
type CheckForm = { id: string; name: string; display_name: string; source_id: string; target_id: string; tags: string; interval_seconds: string; enabled: boolean };

type DrawerState =
  | { kind: 'source'; mode: DrawerMode; title: string; form: SourceForm }
  | { kind: 'target'; mode: DrawerMode; title: string; form: TargetForm }
  | { kind: 'check'; mode: DrawerMode; title: string; form: CheckForm; deletable?: boolean }
  | { kind: 'install'; title: string; install: InstallPayload };

type AdminAppProps = { page: AdminPage };

const TOKEN_KEY = 'wiki_admin_token';
const blankSource: SourceForm = { id: '', name: '', display_name: '', region: '', tags: '' };
const blankTarget: TargetForm = { ...blankSource, kind: 'tcp', host: '', port: '443', path: '/' };
const blankCheck: CheckForm = { id: '', name: '', display_name: '', source_id: '', target_id: '', tags: '', interval_seconds: '30', enabled: true };
const pageTitles: Record<AdminPage, string> = { home: '总览', sources: '源节点', targets: '目标', checks: '探测任务', agents: '源节点' };
const navItems = [
  { page: 'sources', label: '源节点', href: '/admin/sources' },
  { page: 'targets', label: '目标', href: '/admin/targets' },
  { page: 'checks', label: '探测任务', href: '/admin/checks' },
] as const;

async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch (_) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}

function tagsFromText(value: string) { return value.split(',').map((tag) => tag.trim()).filter(Boolean); }
function tagsToText(tags: string[] | undefined) { return (tags ?? []).join(', '); }
function empty(value?: string | number | boolean | null) { return value === undefined || value === null || value === '' ? '—' : value; }
function normalizeKind(kind?: string): TargetKind { return kind === 'icmp' || kind === 'http' || kind === 'https' ? kind : 'tcp'; }
function normalizePath(kind: TargetKind, path?: string) { if (kind !== 'http' && kind !== 'https') return ''; const next = (path || '/').trim() || '/'; return next.startsWith('/') ? next : `/${next}`; }
function formatTime(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}
function statusLabel(status?: string) { return status || 'pending'; }
function metric(check: Check) { const latency = check.latency_ms || check.latency_ms === 0 ? `${check.latency_ms}ms` : '待上报'; return `${latency} / loss ${check.loss_pct ?? 0}% / jitter ${check.jitter_ms ?? 0}ms`; }
function maskToken(token: string) { return token ? `•••• ${token.slice(-4)}` : '••••'; }
function displayAgentToken(agent?: Agent, visible = false) { if (!agent) return '— 重置以生成 Token'; if (!agent.token) return '— 重置以生成 Token'; return visible ? agent.token : maskToken(agent.token); }
function formatTargetAddress(target: Target) {
  const kind = normalizeKind(target.kind);
  if (!target.host) return '—';
  if (kind === 'icmp') return `icmp ${target.host}`;
  if (kind === 'http' || kind === 'https') {
    const port = Number(target.port || (kind === 'http' ? 80 : 443));
    const defaultPort = kind === 'http' ? 80 : 443;
    const portText = port === defaultPort ? '' : `:${port}`;
    return `${kind}://${target.host}${portText}${normalizePath(kind, target.path)}`;
  }
  return `${target.host}:${target.port}`;
}

export default function AdminApp({ page }: AdminAppProps) {
  const normalizedPage = page === 'agents' ? 'sources' : page;
  const [token, setToken] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [authReady, setAuthReady] = useState(false);
  const [notice, setNotice] = useState('');
  const [errorBanner, setErrorBanner] = useState('');
  const [sources, setSources] = useState<Source[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [checks, setChecks] = useState<Check[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [checksView, setChecksView] = useState<'matrix' | 'list'>('matrix');
  const [visibleTokens, setVisibleTokens] = useState<Record<string, boolean>>({});

  const sourceName = useMemo(() => new Map(sources.map((item) => [item.id, item.display_name])), [sources]);
  const targetName = useMemo(() => new Map(targets.map((item) => [item.id, item.display_name])), [targets]);
  const agentBySource = useMemo(() => new Map(agents.map((item) => [item.source_id || item.id, item])), [agents]);
  const sortedSources = useMemo(() => [...sources].sort((a, b) => (a.region || '').localeCompare(b.region || '') || a.display_name.localeCompare(b.display_name)), [sources]);
  const checkByPair = useMemo(() => new Map(checks.map((item) => [`${item.source_id}::${item.target_id}`, item])), [checks]);

  useEffect(() => {
    document.documentElement.dataset.admin = '1';
    document.body.dataset.pageType = 'admin';
    return () => {
      delete document.documentElement.dataset.admin;
      delete document.body.dataset.pageType;
    };
  }, []);

  useEffect(() => { const saved = localStorage.getItem(TOKEN_KEY) ?? ''; setToken(saved); setTokenInput(saved); setAuthReady(true); }, []);
  useEffect(() => { if (!authReady || !token) return; loadAll().catch(showError); }, [authReady, token]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 3000); return () => window.clearTimeout(timer); }, [notice]);
  useEffect(() => { if (page !== 'agents') return; window.history.replaceState(null, '', '/admin/sources'); }, [page]);

  async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
    if (response.ok) return (await response.json()) as T;
    let message = '';
    const text = await response.text();
    try { message = (JSON.parse(text) as { error?: string }).error || ''; } catch { message = text.trim(); }
    if (response.status === 401) { localStorage.removeItem(TOKEN_KEY); setToken(''); setTokenInput(''); }
    throw new Error(message || `请求失败：${response.status} ${response.statusText}`);
  }

  async function loadAll() {
    if (!token) return;
    const [sourceData, targetData, checkData, agentData] = await Promise.all([
      adminFetch<{ sources: Source[] }>('/api/admin/sources'), adminFetch<{ targets: Target[] }>('/api/admin/targets'), adminFetch<{ checks: Check[] }>('/api/admin/checks'), adminFetch<{ agents: Agent[] }>('/api/admin/agents'),
    ]);
    setSources(sourceData.sources ?? []); setTargets((targetData.targets ?? []).map((item) => ({ ...item, kind: normalizeKind(item.kind), path: normalizePath(normalizeKind(item.kind), item.path) }))); setChecks((checkData.checks ?? []).map((item) => ({ ...item, last_error: item.last_error ?? '' }))); setAgents(agentData.agents ?? []);
  }
  function showError(error: unknown) { setErrorBanner(error instanceof Error ? error.message : '请求失败'); }
  function login(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const nextToken = tokenInput.trim(); if (!nextToken) return; localStorage.setItem(TOKEN_KEY, nextToken); setToken(nextToken); setNotice('Token 已保存。'); }
  function logout() { localStorage.removeItem(TOKEN_KEY); setToken(''); setTokenInput(''); setDrawer(null); setNotice('已退出登录。'); window.history.pushState(null, '', '/admin'); }
  function sourceForm(item?: Source): SourceForm { return item ? { id: item.id, name: '', display_name: item.display_name, region: item.region, tags: tagsToText(item.tags) } : blankSource; }
  function targetForm(item?: Target): TargetForm { const kind = normalizeKind(item?.kind); return item ? { id: item.id, name: '', display_name: item.display_name, region: item.region, tags: tagsToText(item.tags), kind, host: item.host || '', port: String(item.port || (kind === 'http' ? 80 : 443)), path: normalizePath(kind, item.path) || '/' } : blankTarget; }
  function checkForm(item?: Check, source?: Source, target?: Target): CheckForm { if (item) return { id: item.id, name: '', display_name: item.display_name, source_id: item.source_id, target_id: item.target_id, tags: tagsToText(item.tags), interval_seconds: String(item.interval_seconds || 30), enabled: item.enabled }; const name = source && target ? `${source.display_name} → ${target.display_name}` : ''; return { ...blankCheck, name, display_name: name, source_id: source?.id ?? '', target_id: target?.id ?? '' }; }

  async function saveSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!drawer || drawer.kind !== 'source') return;
    const form = drawer.form; const body = JSON.stringify({ name: form.name || form.display_name, display_name: form.display_name || form.name, region: form.region, tags: tagsFromText(form.tags) });
    try { const created = await adminFetch<Source>(drawer.mode === 'edit' ? `/api/admin/sources/${encodeURIComponent(form.id)}` : '/api/admin/sources', { method: drawer.mode === 'edit' ? 'PUT' : 'POST', body }); await loadAll(); setNotice(drawer.mode === 'edit' ? '源节点已更新。' : '源节点已创建。'); if (drawer.mode === 'create') await createAgentAndOpenInstall(created.id, `${created.display_name} 接入命令`); else setDrawer(null); } catch (error) { showError(error); }
  }
  async function saveTarget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!drawer || drawer.kind !== 'target') return;
    const form = drawer.form; const kind = normalizeKind(form.kind); const body = JSON.stringify({ name: form.name || form.display_name, display_name: form.display_name || form.name, region: form.region, tags: tagsFromText(form.tags), kind, host: form.host, port: kind === 'icmp' ? 0 : Number(form.port || (kind === 'http' ? 80 : 443)), path: normalizePath(kind, form.path), status: 'online' });
    try { await adminFetch(drawer.mode === 'edit' ? `/api/admin/targets/${encodeURIComponent(form.id)}` : '/api/admin/targets', { method: drawer.mode === 'edit' ? 'PUT' : 'POST', body }); await loadAll(); setDrawer(null); setNotice(drawer.mode === 'edit' ? '目标已更新。' : '目标已创建。'); } catch (error) { showError(error); }
  }
  async function saveCheck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!drawer || drawer.kind !== 'check') return;
    const form = drawer.form; const body = JSON.stringify({ name: form.name || form.display_name, display_name: form.display_name || form.name, source_id: form.source_id, target_id: form.target_id, tags: tagsFromText(form.tags), interval_seconds: Number(form.interval_seconds), enabled: form.enabled, status: 'pending' });
    try { await adminFetch(drawer.mode === 'edit' ? `/api/admin/checks/${encodeURIComponent(form.id)}` : '/api/admin/checks', { method: drawer.mode === 'edit' ? 'PUT' : 'POST', body }); await loadAll(); setDrawer(null); setNotice(drawer.mode === 'edit' ? '任务已更新。' : '任务已创建。'); } catch (error) { showError(error); }
  }
  async function deleteResource(resource: 'sources' | 'targets' | 'checks', id: string) { if (!window.confirm('确认删除？')) return; try { await adminFetch(`/api/admin/${resource}/${encodeURIComponent(id)}`, { method: 'DELETE' }); await loadAll(); setDrawer(null); setNotice('已删除。'); } catch (error) { showError(error); } }
  async function createAgentAndOpenInstall(id: string, title: string) { await adminFetch('/api/admin/agents', { method: 'POST', body: JSON.stringify({ id }) }); const install = await adminFetch<InstallPayload>(`/api/admin/agents/${encodeURIComponent(id)}/install`); await loadAll(); setVisibleTokens((tokens) => ({ ...tokens, [id]: true })); setDrawer({ kind: 'install', title, install }); }
  async function resetToken(id: string) { try { const created = await adminFetch<{ agent: Agent; token: string }>(`/api/admin/agents/${encodeURIComponent(id)}/reset-token`, { method: 'POST', body: '{}' }); setAgents((items) => items.map((item) => (item.id === id || item.source_id === id ? { ...item, ...created.agent, token: created.token } : item))); await loadAll(); setVisibleTokens((tokens) => ({ ...tokens, [id]: true })); setNotice('Token 已重置。'); } catch (error) { showError(error); } }
  async function showInstall(id: string) { try { const install = await adminFetch<InstallPayload>(`/api/admin/agents/${encodeURIComponent(id)}/install`); setDrawer({ kind: 'install', title: `${id} 接入命令`, install }); } catch (error) { showError(error); } }
  async function copyUninstall(id: string) { try { const install = await adminFetch<InstallPayload>(`/api/admin/agents/${encodeURIComponent(id)}/install`); await copyText(install.one_line_uninstall || install.install_command); } catch (error) { showError(error); } }
  async function copyText(text: string) { await writeClipboard(text); setNotice('已复制到剪贴板。'); }

  if (!authReady) return <section className="admin-shell">加载中…</section>;
  if (!token) return <section className="admin-shell admin-login"><p className="admin-kicker">Control Room</p><h1>Probe Admin</h1><p>输入后台 Token，开始管理源节点、目标和探测任务。</p><form className="admin-card admin-form" onSubmit={login}><label>Token<input type="password" value={tokenInput} onChange={(event) => setTokenInput(event.target.value)} autoComplete="off" /></label><button type="submit">进入后台</button></form><Toast notice={notice} /><ErrorBanner message={errorBanner} onClose={() => setErrorBanner('')} /></section>;
  return <section className="admin-layout"><aside className="admin-sidebar"><a className="admin-brand" href="/admin/sources">Probe Admin</a><nav>{navItems.map((item) => <a key={item.page} className={normalizedPage === item.page ? 'active' : ''} href={item.href}>{item.label}</a>)}<button type="button" onClick={logout}>退出</button></nav></aside><main className="admin-shell"><header className="admin-header"><div><p className="admin-kicker">Probe Admin</p><h1>{pageTitles[normalizedPage]}</h1></div><div className="admin-auth"><span>Token {maskToken(token)}</span><button type="button" onClick={logout}>退出登录</button></div></header><Toast notice={notice} /><ErrorBanner message={errorBanner} onClose={() => setErrorBanner('')} />{normalizedPage === 'home' && <Dashboard sources={sources} targets={targets} checks={checks} />}{normalizedPage === 'sources' && <SourcesPage sources={sources} agents={agentBySource} visibleTokens={visibleTokens} onToggleToken={(id) => setVisibleTokens((items) => ({ ...items, [id]: !items[id] }))} onCopy={copyText} onUninstall={copyUninstall} onNew={() => setDrawer({ kind: 'source', mode: 'create', title: '新增源节点', form: blankSource })} onEdit={(item) => setDrawer({ kind: 'source', mode: 'edit', title: `编辑：${item.display_name}`, form: sourceForm(item) })} onDelete={(id) => deleteResource('sources', id)} onReset={resetToken} onInstall={showInstall} />}{normalizedPage === 'targets' && <TargetsPage targets={targets} onNew={() => setDrawer({ kind: 'target', mode: 'create', title: '新增目标', form: blankTarget })} onEdit={(item) => setDrawer({ kind: 'target', mode: 'edit', title: `编辑：${item.display_name}`, form: targetForm(item) })} onDelete={(id) => deleteResource('targets', id)} />}{normalizedPage === 'checks' && <ChecksPage view={checksView} setView={setChecksView} sources={sortedSources} targets={targets} checks={checks} sourceName={sourceName} targetName={targetName} checkByPair={checkByPair} onNew={() => setDrawer({ kind: 'check', mode: 'create', title: '新增任务', form: blankCheck })} onCreatePair={(source, target) => setDrawer({ kind: 'check', mode: 'create', title: `${source.display_name} → ${target.display_name}`, form: checkForm(undefined, source, target) })} onEdit={(item) => setDrawer({ kind: 'check', mode: 'edit', title: `编辑：${item.display_name}`, form: checkForm(item), deletable: true })} />}</main>{drawer && <Drawer drawer={drawer} setDrawer={setDrawer} sources={sources} targets={targets} onClose={() => setDrawer(null)} onCopy={copyText} onSaveSource={saveSource} onSaveTarget={saveTarget} onSaveCheck={saveCheck} onDeleteCheck={(id) => deleteResource('checks', id)} />}</section>;
}

function Dashboard({ sources, targets, checks }: { sources: Source[]; targets: Target[]; checks: Check[] }) { return <div className="admin-grid"><a className="admin-card admin-stat" href="/admin/sources"><span>源节点</span><strong>{sources.length}</strong></a><a className="admin-card admin-stat" href="/admin/targets"><span>目标</span><strong>{targets.length}</strong></a><a className="admin-card admin-stat" href="/admin/checks"><span>任务</span><strong>{checks.length}</strong></a></div>; }
function Toast({ notice }: { notice: string }) { return notice ? <div className="admin-notice">{notice}</div> : null; }
function ErrorBanner({ message, onClose }: { message: string; onClose: () => void }) { return message ? <div className="admin-error"><span>{message}</span><button type="button" onClick={onClose}>×</button></div> : null; }
function TableWrap({ children }: { children: ReactNode }) { return <div className="admin-table-wrap">{children}</div>; }
function SourcesPage({ sources, agents, visibleTokens, onToggleToken, onNew, onEdit, onDelete, onReset, onInstall, onUninstall, onCopy }: { sources: Source[]; agents: Map<string, Agent>; visibleTokens: Record<string, boolean>; onToggleToken: (id: string) => void; onNew: () => void; onEdit: (item: Source) => void; onDelete: (id: string) => void; onReset: (id: string) => void; onInstall: (id: string) => void; onUninstall: (id: string) => void; onCopy: (text: string) => void }) {
  return <><Toolbar title="源节点" action="新增源节点" onAction={onNew} /><TableWrap><table><thead><tr><th>名称</th><th>地区</th><th>标签</th><th>状态</th><th>最近活动时间</th><th className="admin-actions">操作</th></tr></thead><tbody>{sources.map((item) => { const agent = agents.get(item.id); const token = agent?.token ?? ''; return <RowGroup key={item.id} main={<tr><td><strong>{empty(item.display_name)}</strong><small>{item.id}</small></td><td>{empty(item.region)}</td><td><Chips tags={item.tags} /></td><td>{empty(item.status)}</td><td>{formatTime(item.updated_at)}</td><td className="admin-actions"><button onClick={() => onEdit(item)}>编辑</button><button onClick={() => onReset(item.id)}>{agent ? '重置 Token' : '生成 Token'}</button><button onClick={() => onInstall(item.id)}>查看安装命令</button><button onClick={() => onUninstall(item.id)}>复制卸载命令</button><button className="danger" onClick={() => onDelete(item.id)}>删除</button></td></tr>} detail={<tr className="admin-detail"><td colSpan={6}><div className="admin-token-row"><span>Agent Token：<code>{displayAgentToken(agent, visibleTokens[item.id])}</code></span><button disabled={!token} onClick={() => token && onCopy(token)}>复制 Token</button><button onClick={() => onReset(item.id)}>{agent ? '重置 Token' : '生成 Token'}</button><button onClick={() => onInstall(item.id)}>查看安装命令</button><button onClick={() => onUninstall(item.id)}>复制卸载命令</button><button disabled={!token} onClick={() => onToggleToken(item.id)}>{visibleTokens[item.id] ? '🙈' : '👁️'}</button><span>Token 前缀：{empty(agent?.token_prefix)}</span><span>最近活动时间：{formatTime(agent?.last_seen_at)}</span><span>最近上报：{formatTime(agent?.last_reported_at)}</span><span>主机名：{empty(agent?.hostname)}</span><span>版本：{empty(agent?.version)}</span></div></td></tr>} />; })}</tbody></table></TableWrap></>;
}
function TargetsPage({ targets, onNew, onEdit, onDelete }: { targets: Target[]; onNew: () => void; onEdit: (item: Target) => void; onDelete: (id: string) => void }) { return <><Toolbar title="目标" action="新增目标" onAction={onNew} /><TableWrap><table><thead><tr><th>名称</th><th>地区</th><th>协议</th><th>地址</th><th>标签</th><th>状态</th><th>最近活动时间</th><th className="admin-actions">操作</th></tr></thead><tbody>{targets.map((item) => <tr key={item.id}><td><strong>{empty(item.display_name)}</strong><small>{item.id}</small></td><td>{empty(item.region)}</td><td>{normalizeKind(item.kind)}</td><td>{formatTargetAddress(item)}</td><td><Chips tags={item.tags} /></td><td>{empty(item.status)}</td><td>{formatTime(item.updated_at)}</td><td className="admin-actions"><button onClick={() => onEdit(item)}>编辑</button><button className="danger" onClick={() => onDelete(item.id)}>删除</button></td></tr>)}</tbody></table></TableWrap></>; }
function ChecksPage({ view, setView, sources, targets, checks, sourceName, targetName, checkByPair, onNew, onCreatePair, onEdit }: { view: 'matrix' | 'list'; setView: (view: 'matrix' | 'list') => void; sources: Source[]; targets: Target[]; checks: Check[]; sourceName: Map<string, string>; targetName: Map<string, string>; checkByPair: Map<string, Check>; onNew: () => void; onCreatePair: (source: Source, target: Target) => void; onEdit: (item: Check) => void }) { return <><div className="admin-toolbar"><div><h2>任务</h2><div className="admin-toggle"><button className={view === 'matrix' ? 'active' : ''} onClick={() => setView('matrix')}>交叉表</button><button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>列表</button></div></div><button onClick={onNew}>新增任务</button></div>{view === 'matrix' ? <ChecksMatrix sources={sources} targets={targets} checkByPair={checkByPair} onCreatePair={onCreatePair} onEdit={onEdit} /> : <ChecksList checks={checks} sourceName={sourceName} targetName={targetName} onEdit={onEdit} />}</>; }
function ChecksMatrix({ sources, targets, checkByPair, onCreatePair, onEdit }: { sources: Source[]; targets: Target[]; checkByPair: Map<string, Check>; onCreatePair: (source: Source, target: Target) => void; onEdit: (item: Check) => void }) { return <div className="admin-matrix"><table><thead><tr><th>目标 \ 源</th>{sources.map((source) => <th key={source.id}><strong>{source.display_name}</strong><small>{source.region || source.id}</small></th>)}</tr></thead><tbody>{targets.map((target) => <tr key={target.id}><th><strong>{target.display_name}</strong><small>{target.id}</small></th>{sources.map((source) => { const check = checkByPair.get(`${source.id}::${target.id}`); return <td key={`${source.id}-${target.id}`}>{check ? <button className={`matrix-cell status-${statusLabel(check.status)}`} title={check.last_error || '无最近错误'} onClick={() => onEdit(check)}><strong>{check.latency_ms ? `${check.latency_ms}ms` : '待上报'}{check.status === 'fail' && check.last_error ? ' ⚠' : ''}</strong><span>{statusLabel(check.status)}</span></button> : <button className="matrix-empty" onClick={() => onCreatePair(source, target)}>+</button>}</td>; })}</tr>)}</tbody></table></div>; }
function ChecksList({ checks, sourceName, targetName, onEdit }: { checks: Check[]; sourceName: Map<string, string>; targetName: Map<string, string>; onEdit: (item: Check) => void }) { return <TableWrap><table><thead><tr><th>名称</th><th>源节点</th><th>目标</th><th>轮询间隔</th><th>启用</th><th>标签</th><th>状态</th><th>最近指标</th><th>最近错误</th><th>最近活动时间</th><th className="admin-actions">操作</th></tr></thead><tbody>{checks.map((item) => <tr key={item.id}><td><strong>{empty(item.display_name)}</strong><small>{item.id}</small></td><td>{empty(sourceName.get(item.source_id) ?? item.source_id)}</td><td>{empty(targetName.get(item.target_id) ?? item.target_id)}</td><td>{item.interval_seconds ? `${item.interval_seconds}s` : '—'}</td><td>{item.enabled ? '是' : '否'}</td><td><Chips tags={item.tags} /></td><td>{empty(item.status)}</td><td>{metric(item)}</td><td className="admin-last-error" title={item.last_error || ''}>{empty(item.last_error)}</td><td>{formatTime(item.updated_at)}</td><td className="admin-actions"><button onClick={() => onEdit(item)}>编辑</button></td></tr>)}</tbody></table></TableWrap>; }
function Toolbar({ title, action, onAction }: { title: string; action: string; onAction: () => void }) { return <div className="admin-toolbar"><h2>{title}</h2><button onClick={onAction}>{action}</button></div>; }
function RowGroup({ main, detail }: { main: ReactNode; detail: ReactNode }) { return <>{main}{detail}</>; }
function Chips({ tags }: { tags?: string[] }) { return tags?.length ? <div className="admin-chips">{tags.map((tag) => <span key={tag}>{tag}</span>)}</div> : <>—</>; }
function Drawer({ drawer, setDrawer, sources, targets, onClose, onCopy, onSaveSource, onSaveTarget, onSaveCheck, onDeleteCheck }: { drawer: DrawerState; setDrawer: (drawer: DrawerState) => void; sources: Source[]; targets: Target[]; onClose: () => void; onCopy: (text: string) => void; onSaveSource: (event: FormEvent<HTMLFormElement>) => void; onSaveTarget: (event: FormEvent<HTMLFormElement>) => void; onSaveCheck: (event: FormEvent<HTMLFormElement>) => void; onDeleteCheck: (id: string) => void }) { useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onClose]); return <div className="admin-drawer-backdrop" onMouseDown={onClose}><aside className="admin-drawer" onMouseDown={(event) => event.stopPropagation()}><header><h2>{drawer.title}</h2><button onClick={onClose}>关闭</button></header>{drawer.kind === 'source' && <SourceFormView drawer={drawer} setDrawer={setDrawer} onSubmit={onSaveSource} />}{drawer.kind === 'target' && <TargetFormView drawer={drawer} setDrawer={setDrawer} onSubmit={onSaveTarget} />}{drawer.kind === 'check' && <CheckFormView drawer={drawer} setDrawer={setDrawer} sources={sources} targets={targets} onSubmit={onSaveCheck} onDelete={onDeleteCheck} />}{drawer.kind === 'install' && <InstallView install={drawer.install} onCopy={onCopy} />}</aside></div>; }
function SourceFormView({ drawer, setDrawer, onSubmit }: { drawer: Extract<DrawerState, { kind: 'source' }>; setDrawer: (drawer: DrawerState) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) { const setForm = (form: SourceForm) => setDrawer({ ...drawer, form }); return <form className="admin-form vertical" onSubmit={onSubmit}>{drawer.mode === 'edit' && <ReadOnlyID id={drawer.form.id} />}<TextInput label="名称" value={drawer.form.display_name || drawer.form.name} onChange={(value) => setForm({ ...drawer.form, display_name: value, name: value })} /><TextInput label="地区" value={drawer.form.region} onChange={(region) => setForm({ ...drawer.form, region })} required={false} /><TextInput label="标签（逗号分隔）" value={drawer.form.tags} onChange={(tags) => setForm({ ...drawer.form, tags })} required={false} /><button>保存源节点</button></form>; }
function TargetFormView({ drawer, setDrawer, onSubmit }: { drawer: Extract<DrawerState, { kind: 'target' }>; setDrawer: (drawer: DrawerState) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) { const setForm = (form: TargetForm) => setDrawer({ ...drawer, form }); const kind = normalizeKind(drawer.form.kind); return <form className="admin-form vertical" onSubmit={onSubmit}>{drawer.mode === 'edit' && <ReadOnlyID id={drawer.form.id} />}<TextInput label="名称" value={drawer.form.display_name || drawer.form.name} onChange={(value) => setForm({ ...drawer.form, display_name: value, name: value })} /><TextInput label="地区" value={drawer.form.region} onChange={(region) => setForm({ ...drawer.form, region })} required={false} /><label>协议<select value={kind} onChange={(event) => { const nextKind = normalizeKind(event.target.value); setForm({ ...drawer.form, kind: nextKind, port: nextKind === 'icmp' ? '0' : drawer.form.port || (nextKind === 'http' ? '80' : '443'), path: normalizePath(nextKind, drawer.form.path) || '/' }); }}><option value="tcp">TCP</option><option value="icmp">ICMP</option><option value="http">HTTP</option><option value="https">HTTPS</option></select></label><TextInput label="Host" value={drawer.form.host} onChange={(host) => setForm({ ...drawer.form, host })} />{kind !== 'icmp' && <TextInput label="Port" type="number" value={drawer.form.port} onChange={(port) => setForm({ ...drawer.form, port })} />}{(kind === 'http' || kind === 'https') && <TextInput label="Path" value={drawer.form.path || '/'} onChange={(path) => setForm({ ...drawer.form, path })} required={false} />}<TextInput label="标签（逗号分隔）" value={drawer.form.tags} onChange={(tags) => setForm({ ...drawer.form, tags })} required={false} /><button>保存目标</button></form>; }
function CheckFormView({ drawer, setDrawer, sources, targets, onSubmit, onDelete }: { drawer: Extract<DrawerState, { kind: 'check' }>; setDrawer: (drawer: DrawerState) => void; sources: Source[]; targets: Target[]; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onDelete: (id: string) => void }) { const setForm = (form: CheckForm) => setDrawer({ ...drawer, form }); return <form className="admin-form vertical" onSubmit={onSubmit}>{drawer.mode === 'edit' && <ReadOnlyID id={drawer.form.id} />}<TextInput label="名称" value={drawer.form.display_name || drawer.form.name} onChange={(value) => setForm({ ...drawer.form, display_name: value, name: value })} /><SelectInput label="源节点" value={drawer.form.source_id} options={sources} onChange={(source_id) => setForm({ ...drawer.form, source_id })} /><SelectInput label="目标" value={drawer.form.target_id} options={targets} onChange={(target_id) => setForm({ ...drawer.form, target_id })} /><TextInput label="轮询间隔（秒）" type="number" value={drawer.form.interval_seconds} onChange={(interval_seconds) => setForm({ ...drawer.form, interval_seconds })} /><TextInput label="标签（逗号分隔）" value={drawer.form.tags} onChange={(tags) => setForm({ ...drawer.form, tags })} required={false} /><label className="admin-check"><input type="checkbox" checked={drawer.form.enabled} onChange={(event) => setForm({ ...drawer.form, enabled: event.target.checked })} /> 启用</label><button>保存任务</button>{drawer.deletable && <button type="button" className="danger" onClick={() => onDelete(drawer.form.id)}>删除任务</button>}</form>; }
function InstallView({ install, onCopy }: { install: InstallPayload; onCopy: (text: string) => void }) { const oneLine = install.one_line || install.install_command; return <div className="install-view"><p>Agent Token：<code>{install.token}</code></p><section className="install-primary"><header><h3>一键安装</h3><button onClick={() => onCopy(oneLine)}>复制安装命令</button></header><pre>{oneLine}</pre></section><details className="install-details"><summary>高级安装片段</summary><CommandBlock title="systemd unit" text={install.systemd_unit} label="复制 unit" onCopy={onCopy} /><CommandBlock title="config.json" text={install.config_json} label="复制 config.json" onCopy={onCopy} /><CommandBlock title="旧 install command" text={install.install_command} label="复制旧命令" onCopy={onCopy} /><CommandBlock title="一行 uninstall" text={install.one_line_uninstall} label="复制卸载命令" onCopy={onCopy} /></details></div>; }
function CommandBlock({ title, text, label, onCopy }: { title: string; text: string; label: string; onCopy: (text: string) => void }) { return <section className="install-block"><header><h3>{title}</h3><button onClick={() => onCopy(text)}>{label}</button></header><pre>{text}</pre></section>; }
function ReadOnlyID({ id }: { id: string }) { return <label>ID<input value={id} disabled readOnly /></label>; }
function TextInput({ label, value, onChange, type = 'text', required = true }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) { return <label>{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} /></label>; }
function SelectInput({ label, value, options, onChange }: { label: string; value: string; options: Array<{ id: string; display_name: string }>; onChange: (value: string) => void }) { return <label>{label}<select value={value} onChange={(event) => onChange(event.target.value)} required><option value="">请选择</option>{options.map((item) => <option value={item.id} key={item.id}>{item.display_name} · {item.id}</option>)}</select></label>; }
