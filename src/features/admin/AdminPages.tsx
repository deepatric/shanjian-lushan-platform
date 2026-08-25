import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { BrandMark, Button, DataTable, FeedbackDialog, Panel, StatusBadge, TextField } from '../../components/ui';
import { adminApi } from '../../services/api';
import { useAppStore } from '../../stores/useAppStore';
import type { AdminLog, Event, ExportRequest, Media, Person, Place, Source, UgcSubmission } from '../../types/domain';

export function AdminLayout() {
  const navigate = useNavigate();
  const { user, logout } = useAppStore();
  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <Link to="/map" className="admin-brand"><BrandMark compact /></Link>
        <nav>
          <NavLink to="/admin/dashboard">仪表盘</NavLink>
          <NavLink to="/admin/data">数据管理</NavLink>
          <NavLink to="/admin/review">UGC 审核</NavLink>
          <NavLink to="/admin/exports">导出审批</NavLink>
          <NavLink to="/admin/settings">系统配置</NavLink>
          <NavLink to="/admin/logs">操作日志</NavLink>
        </nav>
        <div className="admin-user"><span>{user?.email}</span><button onClick={() => { logout(); navigate('/admin/login'); }}>退出</button></div>
      </aside>
      <section className="admin-main"><Outlet /></section>
    </main>
  );
}

export function AdminDashboard() {
  const [stats, setStats] = useState<Array<{ label: string; value: number; hint: string }>>([]);
  useEffect(() => { void adminApi.getDashboard().then((data) => setStats(data.stats)); }, []);
  return <AdminPage title="仪表盘" meta="DASHBOARD"><div className="stat-grid">{stats.map((stat) => <article className="stat-card" key={stat.label}><span>{stat.label}</span><strong>{stat.value}</strong><p>{stat.hint}</p></article>)}</div><Panel title="近期工作" meta="QUEUE"><div className="admin-timeline"><p>待审 UGC 与导出申请已进入队列。</p><p>公开前台仅显示 approved 数据。</p><p>地图点位由 API 和数据库驱动。</p></div></Panel></AdminPage>;
}

export function AdminDataPage() {
  type ResourceTab = 'places' | 'events' | 'persons' | 'media' | 'sources';
  type EditorState = { id?: string; primary: string; detail: string };
  const [tab, setTab] = useState<ResourceTab>('places');
  const [rows, setRows] = useState<Array<Place | Event | Person | Media | Source>>([]);
  const [query, setQuery] = useState('');
  const [syncText, setSyncText] = useState('');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [feedback, setFeedback] = useState<{ title: string; message: string; tone?: 'success' | 'warning' | 'error' | 'info' } | null>(null);

  const loadRows = () => {
    const loaders = { places: adminApi.getPlaces, events: adminApi.getEvents, persons: adminApi.getPersons, media: adminApi.getMedia, sources: adminApi.getSources };
    void loaders[tab]().then((data) => setRows(data as Array<Place | Event | Person | Media | Source>));
  };

  useEffect(() => { loadRows(); }, [tab]);

  const payloadFor = (value: EditorState) => ({
    places: { name: value.primary, summary: value.detail, placeType: 'heritage', longitude: 115.98, latitude: 29.57, regionId: 'r-guling', region: '庐山牯岭及周边', status: 'draft' },
    events: { title: value.primary, summary: value.detail, year: 1938, month: 1, region: '庐山牯岭及周边' },
    persons: { name: value.primary, summary: value.detail, aliases: [] },
    media: { title: value.primary, caption: value.detail, mediaType: 'image', isAiGenerated: false },
    sources: { title: value.primary, citation: value.detail, sourceType: 'archive' },
  })[tab];

  const saveEditor = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editor?.primary.trim()) return;
    try {
      const payload = payloadFor({ ...editor, primary: editor.primary.trim(), detail: editor.detail.trim() });
      if (editor.id) await adminApi.updateResource(tab, editor.id, payload);
      else await adminApi.createResource(tab, payload);
      setSyncText(editor.id ? '记录修改已写入后端数据库' : '新增记录已写入后端数据库');
      setFeedback({ title: editor.id ? '保存成功' : '新增成功', message: `${labelForTab(tab)}记录已写入后端数据库。` });
      setEditor(null);
      loadRows();
    } catch {
      setFeedback({ title: '保存失败', message: '记录未写入数据库，请检查字段内容。', tone: 'error' });
    }
  };

  const removeRow = async (id: string) => {
    try {
      await adminApi.deleteResource(tab, id);
      setRows((current) => current.filter((row) => row.id !== id));
      setSyncText('记录已从后端数据库删除');
      setFeedback({ title: '删除成功', message: `${id} 已从后端数据库删除。`, tone: 'warning' });
    } catch {
      setFeedback({ title: '删除失败', message: '该记录仍被其他数据引用，未执行删除。', tone: 'error' });
    } finally {
      setPendingDelete(null);
    }
  };

  const tableRows = rows
    .map((row, index) => ({ ...row, id: row.id ?? String(index) }) as { id: string; [key: string]: unknown })
    .filter((row) => {
      const keyword = query.trim().toLowerCase();
      if (!keyword) return true;
      return `${row.name ?? ''}${row.title ?? ''}${row.summary ?? ''}${row.citation ?? ''}${row.id}`.toLowerCase().includes(keyword);
    });

  return <AdminPage title="数据管理" meta="DATA">
    <div className="tab-row">{(['places','events','persons','media','sources'] as const).map((item) => <button className={tab === item ? 'active' : ''} key={item} onClick={() => { setTab(item); setSyncText(''); }}>{labelForTab(item)}</button>)}</div>
    <Panel title={labelForTab(tab)} meta="TABLE" actions={<Button onClick={() => setEditor({ primary: '', detail: '' })}>新增记录</Button>}>
      <TextField label="表内筛选" placeholder="输入名称、来源或编号" value={query} onChange={setQuery} />
      {syncText && <div className="notice-box">{syncText}</div>}
      <DataTable rows={tableRows} columns={[{ key: 'name', label: '名称', render: (row) => String(row.name ?? row.title ?? row.id) }, { key: 'summary', label: '说明', render: (row) => String(row.summary ?? row.caption ?? row.citation ?? row.sourceType ?? '—') }, { key: 'id', label: 'ID' }]} renderActions={(row) => <><Button variant="secondary" onClick={() => setEditor({ id: row.id, primary: String(row.name ?? row.title ?? ''), detail: String(row.summary ?? row.caption ?? row.citation ?? '') })}>编辑</Button><Button variant="ghost" onClick={() => setPendingDelete({ id: row.id, name: String(row.name ?? row.title ?? row.id) })}>删除</Button></>} />
    </Panel>
    {editor && <div className="feedback-overlay"><form className="admin-editor-dialog" onSubmit={saveEditor}>
      <span className="eyebrow">{editor.id ? 'EDIT RECORD' : 'NEW RECORD'}</span>
      <h2>{editor.id ? `编辑${labelForTab(tab)}` : `新增${labelForTab(tab)}`}</h2>
      <TextField label="名称 / 标题" placeholder="请输入名称或标题" value={editor.primary} onChange={(primary) => setEditor({ ...editor, primary })} />
      <TextField label="说明 / 引用" placeholder="请输入说明或引用信息" value={editor.detail} onChange={(detail) => setEditor({ ...editor, detail })} />
      <div className="dialog-actions"><Button type="button" variant="secondary" onClick={() => setEditor(null)}>取消</Button><Button type="submit" disabled={!editor.primary.trim()}>保存</Button></div>
    </form></div>}
    {pendingDelete && <div className="feedback-overlay"><section className="admin-editor-dialog" role="dialog" aria-label="确认删除记录">
      <span className="eyebrow">DELETE RECORD</span><h2>确认删除</h2><p>将删除“{pendingDelete.name}”。如有外键引用，后端会拒绝操作。</p>
      <div className="dialog-actions"><Button variant="secondary" onClick={() => setPendingDelete(null)}>取消</Button><Button onClick={() => void removeRow(pendingDelete.id)}>确认删除</Button></div>
    </section></div>}
    <FeedbackDialog open={!!feedback} title={feedback?.title ?? ''} message={feedback?.message ?? ''} tone={feedback?.tone} onClose={() => setFeedback(null)} />
  </AdminPage>;
}

export function AdminReviewPage() {
  const [rows, setRows] = useState<UgcSubmission[]>([]);
  const [feedback, setFeedback] = useState<{ title: string; message: string; tone?: 'success' | 'warning' | 'error' | 'info' } | null>(null);
  useEffect(() => { void adminApi.getSubmissions().then(setRows); }, []);
  const update = (id: string, status: 'approved' | 'rejected') => setRows((current) => current.map((item) => item.id === id ? { ...item, status } : item));
  return <AdminPage title="UGC 审核" meta="REVIEW"><Panel title="待审核资料" meta="SUBMISSIONS"><DataTable rows={rows} columns={[{ key: 'title', label: '标题' }, { key: 'submitter', label: '提交人' }, { key: 'sourceNote', label: '来源说明' }, { key: 'status', label: '状态', render: (row) => <StatusBadge status={row.status} /> }]} renderActions={(row) => <><Button onClick={() => { void adminApi.approveUgc(row.id).then(() => { update(row.id, 'approved'); setFeedback({ title: '审核通过', message: `${row.title} 已通过审核并写入正式数据。` }); }); }}>通过</Button><Button variant="secondary" onClick={() => { void adminApi.rejectUgc(row.id).then(() => { update(row.id, 'rejected'); setFeedback({ title: '已驳回', message: `${row.title} 已标记为驳回。`, tone: 'warning' }); }); }}>驳回</Button></>} /></Panel><FeedbackDialog open={!!feedback} title={feedback?.title ?? ''} message={feedback?.message ?? ''} tone={feedback?.tone} onClose={() => setFeedback(null)} /></AdminPage>;
}

export function AdminExportsPage() {
  const [rows, setRows] = useState<ExportRequest[]>([]);
  const [feedback, setFeedback] = useState<{ title: string; message: string; tone?: 'success' | 'warning' | 'error' | 'info' } | null>(null);
  useEffect(() => { void adminApi.getExportRequests().then(setRows); }, []);
  const merge = (updated: ExportRequest) => setRows((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
  return <AdminPage title="导出审批" meta="EXPORTS"><Panel title="导出申请" meta="APPROVAL"><DataTable rows={rows} columns={[{ key: 'requestId', label: '编号' }, { key: 'applicant', label: '申请人' }, { key: 'dataScope', label: '范围' }, { key: 'reason', label: '理由' }, { key: 'status', label: '状态', render: (row) => <StatusBadge status={row.status} /> }, { key: 'fileUrl', label: '下载包', render: (row) => row.fileUrl ? '已生成' : '未生成' }]} renderActions={(row) => <><Button onClick={() => { void adminApi.approveExport(row.id).then((updated) => { merge(updated); setFeedback({ title: '导出已批准', message: `${row.requestId} 已生成下载包。用户端状态会自动变成“点击下载”。` }); }); }}>批准</Button><Button variant="secondary" onClick={() => { void adminApi.rejectExport(row.id).then((updated) => { merge(updated); setFeedback({ title: '导出已拒绝', message: `${row.requestId} 已标记为拒绝。`, tone: 'warning' }); }); }}>拒绝</Button></>} /></Panel><FeedbackDialog open={!!feedback} title={feedback?.title ?? ''} message={feedback?.message ?? ''} tone={feedback?.tone} onClose={() => setFeedback(null)} /></AdminPage>;
}

export function AdminSettingsPage() {
  const { basemap, labelDensity, setBasemap, setLabelDensity } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [savedText, setSavedText] = useState('');
  const [feedback, setFeedback] = useState<{ title: string; message: string; tone?: 'success' | 'warning' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    void adminApi.getConfig().then((config) => {
      if (config.defaultBasemap === 'terrain' || config.defaultBasemap === 'satellite' || config.defaultBasemap === 'archive') {
        setBasemap(config.defaultBasemap);
      }
      if (config.labelDensity === 'simple' || config.labelDensity === 'standard' || config.labelDensity === 'detailed') {
        setLabelDensity(config.labelDensity);
      }
    });
  }, [setBasemap, setLabelDensity]);

  const saveConfig = async () => {
    setSaving(true);
    await adminApi.updateConfig({ defaultBasemap: basemap, labelDensity, exportApproval: true });
    setSavedText('配置已写入后端 system_configs 表');
    setFeedback({ title: '配置已保存', message: '地图样式、标签密度和导出审批配置已写入数据库。' });
    setSaving(false);
  };

  return <AdminPage title="系统配置" meta="SETTINGS"><Panel title="地图样式与显示设置" meta="MAP SETTINGS"><div className="setting-list"><div className="setting-group"><span>默认底图</span>{(['terrain','satellite','archive'] as const).map((item) => <button className={basemap === item ? 'active' : ''} key={item} onClick={() => { setBasemap(item); setFeedback({ title: '底图已切换', message: '点击保存配置后会写入后端数据库。', tone: 'info' }); }}>{item === 'terrain' ? '专题地形' : item === 'satellite' ? '卫星参照' : '历史底图'}</button>)}</div><div className="setting-group"><span>标签密度</span>{(['simple','standard','detailed'] as const).map((item) => <button className={labelDensity === item ? 'active' : ''} key={item} onClick={() => { setLabelDensity(item); setFeedback({ title: '标签密度已切换', message: '点击保存配置后会写入后端数据库。', tone: 'info' }); }}>{item === 'simple' ? '简洁' : item === 'standard' ? '标准' : '详细'}</button>)}</div><div className="setting-group"><span>导出审批</span><button className="active" onClick={() => setFeedback({ title: '导出审批已开启', message: '导出仍需管理员审批后才能下载。', tone: 'info' })}>开启</button><button onClick={() => setFeedback({ title: '当前未关闭', message: '为保证数据治理边界，当前版本保持审批开启。', tone: 'warning' })}>关闭</button></div><div className="setting-group"><span>后端同步</span><Button onClick={saveConfig} disabled={saving}>{saving ? '保存中' : '保存配置'}</Button>{savedText && <em>{savedText}</em>}</div></div></Panel><FeedbackDialog open={!!feedback} title={feedback?.title ?? ''} message={feedback?.message ?? ''} tone={feedback?.tone} onClose={() => setFeedback(null)} /></AdminPage>;
}

export function AdminLogsPage() {
  const [rows, setRows] = useState<AdminLog[]>([]);
  useEffect(() => { void adminApi.getLogs().then(setRows); }, []);
  return <AdminPage title="操作日志" meta="LOGS"><Panel title="审计记录" meta="TRACE"><DataTable rows={rows} columns={[{ key: 'createdAt', label: '时间' }, { key: 'operator', label: '操作者' }, { key: 'action', label: '动作' }, { key: 'target', label: '对象' }]} /></Panel></AdminPage>;
}

function AdminPage({ title, meta, children }: { title: string; meta: string; children: React.ReactNode }) {
  return <div className="admin-page"><header className="admin-page-header"><span className="eyebrow">{meta}</span><h1>{title}</h1><p>山鉴-庐山抗战文化景观数字平台后台</p></header>{children}</div>;
}

function labelForTab(tab: string) {
  return ({ places: '地点', events: '事件', persons: '人物', regions: '区域', media: '媒体', sources: '来源' } as Record<string, string>)[tab] ?? tab;
}
