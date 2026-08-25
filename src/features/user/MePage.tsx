import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, ChevronDown } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { BrandMark, Button, DataTable, FeedbackDialog, Panel, StatusBadge, TextArea, TextField, TypeBadge } from '../../components/ui';
import {
  createExportRequest,
  createUgcSubmission,
  getMapPlaces,
  getMyExportRequests,
  getMyFavorites,
  getMySubmissions,
  resolveDownloadUrl,
  updateMyAvatar,
} from '../../services/api';
import { useAppStore } from '../../stores/useAppStore';
import type { ExportRequest, Place, UgcSubmission } from '../../types/domain';

type UserSection = 'dossier' | 'submit' | 'download' | 'favorites' | 'settings';

const userNav: Array<{ id: UserSection; label: string }> = [
  { id: 'dossier', label: '个人档案' },
  { id: 'submit', label: '资料提交' },
  { id: 'download', label: '资料下载' },
  { id: 'favorites', label: '我的收藏' },
  { id: 'settings', label: '偏好设置' },
];

const submissionTypeLabel: Record<UgcSubmission['submissionType'], string> = {
  place: '地点资料',
  text: '文本线索',
  media: '影像资料',
};

async function prepareAvatar(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('请选择 JPG、PNG 或 WebP 图片。');
  if (file.size > 8 * 1024 * 1024) throw new Error('头像原图不能超过 8 MB。');

  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  const size = 384;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器无法处理头像图片。');
  const sourceSize = Math.min(bitmap.width, bitmap.height);
  const sourceX = (bitmap.width - sourceSize) / 2;
  const sourceY = (bitmap.height - sourceSize) / 2;
  context.drawImage(bitmap, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
  bitmap.close();
  return canvas.toDataURL('image/webp', 0.82);
}

export function MePage() {
  const [searchParams] = useSearchParams();
  const { user, basemap, labelDensity, setBasemap, setLabelDensity, setUserProfile } = useAppStore();
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const initialSection = searchParams.get('section') as UserSection | null;
  const [section, setSection] = useState<UserSection>(initialSection && userNav.some((item) => item.id === initialSection) ? initialSection : 'dossier');
  const [submissionType, setSubmissionType] = useState<UgcSubmission['submissionType']>(searchParams.get('type') === 'media' ? 'media' : 'place');
  const [allPlaces, setAllPlaces] = useState<Place[]>([]);
  const [favoritePlaces, setFavoritePlaces] = useState<Place[]>([]);
  const [mySubmissions, setMySubmissions] = useState<UgcSubmission[]>([]);
  const [myExports, setMyExports] = useState<ExportRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ title: string; message: string; tone?: 'success' | 'warning' | 'error' | 'info' } | null>(null);
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<string[]>([]);
  const [placePickerOpen, setPlacePickerOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportReason, setExportReason] = useState('用于课程教学、专题研究或展陈资料整理。');
  const [submissionForm, setSubmissionForm] = useState({
    pointId: searchParams.get('pointId') ?? '',
    title: searchParams.get('title') ?? '莲谷旧交通节点补充',
    place: searchParams.get('place') ?? '牯岭镇莲谷一带',
    coordinates: searchParams.get('coordinates') ?? '115.972, 29.551',
    description: searchParams.get('description') ?? '补充一处与战时交通、资料转移或人员往来相关的空间线索，待管理员核验。',
    imageReference: '',
    sourceNote: '',
  });

  const refreshUserData = async () => {
    if (!user) return;
    setLoading(true);
    const [places, favorites, submissions, requests] = await Promise.all([
      getMapPlaces({ types: ['battle', 'event', 'heritage'], keyword: '' }),
      getMyFavorites(),
      getMySubmissions(),
      getMyExportRequests(),
    ]);
    setAllPlaces(places);
    setFavoritePlaces(favorites);
    setMySubmissions(submissions);
    setMyExports(requests);
    setLoading(false);
  };

  useEffect(() => {
    void refreshUserData();
  }, [user?.id]);

  useEffect(() => {
    if (!user || section !== 'download') return;
    void refreshUserData();
    const timer = window.setInterval(() => void getMyExportRequests().then(setMyExports), 4000);
    return () => window.clearInterval(timer);
  }, [section, user?.id]);

  useEffect(() => {
    if (!user || section !== 'favorites') return;
    void getMyFavorites().then(setFavoritePlaces);
  }, [section, user?.favorites.join('|')]);

  const selectedPlaces = useMemo(
    () => allPlaces.filter((place) => selectedPlaceIds.includes(place.id)),
    [allPlaces, selectedPlaceIds],
  );
  const pendingSubmissions = mySubmissions.filter((item) => item.status === 'pending').length;
  const approvedExports = myExports.filter((item) => item.status === 'approved').length;

  const toggleExportPlace = (placeId: string) => {
    setSelectedPlaceIds((current) => current.includes(placeId) ? current.filter((id) => id !== placeId) : [...current, placeId]);
  };

  const openDownload = (row: ExportRequest) => {
    const downloadUrl = resolveDownloadUrl(row.fileUrl);
    if (!downloadUrl) {
      setFeedback({ title: '暂不能下载', message: '申请尚未审批通过，或后台还没有生成下载链接。', tone: 'warning' });
      return;
    }
    window.open(downloadUrl, '_blank', 'noopener,noreferrer');
    setFeedback({ title: '已触发下载', message: '资料包正在下载，内含 PDF、原始数据和原始照片。' });
  };

  const handleCreateSubmission = async () => {
    const created = await createUgcSubmission({
      submissionType,
      title: submissionForm.title,
      sourceNote: submissionForm.sourceNote,
      placePayload: {
        pointId: submissionForm.pointId,
        place: submissionForm.place,
        coordinates: submissionForm.coordinates,
        description: submissionForm.description,
      },
      mediaPayload: submissionType === 'media' ? {
        pointId: submissionForm.pointId,
        place: submissionForm.place,
        coordinates: submissionForm.coordinates,
        imageReference: submissionForm.imageReference,
      } : undefined,
    });
    setMySubmissions((current) => [created, ...current]);
    setFeedback({ title: '提交成功', message: '提交成功' });
  };

  const confirmExportRequest = async () => {
    if (!selectedPlaces.length) {
      setFeedback({ title: '请选择点位', message: '请先勾选需要导出的点位。', tone: 'warning' });
      return;
    }
    const created = await createExportRequest({
      dataScope: selectedPlaces.map((place) => place.name).join('、'),
      reason: exportReason,
      filters: {
        source: 'user-center',
        placeIds: selectedPlaces.map((place) => place.id),
        placeNames: selectedPlaces.map((place) => place.name),
        basemap,
        labelDensity,
      },
    });
    setMyExports((current) => [created, ...current]);
    setExportDialogOpen(false);
    setFeedback({ title: '提交成功', message: '提交成功' });
  };

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !user) return;
    setAvatarSaving(true);
    try {
      const avatarUrl = await prepareAvatar(file);
      const updatedUser = await updateMyAvatar(avatarUrl);
      setUserProfile(updatedUser);
      setFeedback({ title: '头像已更新', message: '新头像已保存到个人档案。' });
    } catch (error) {
      setFeedback({ title: '头像更新失败', message: error instanceof Error ? error.message : '请更换图片后重试。', tone: 'error' });
    } finally {
      setAvatarSaving(false);
    }
  };

  return (
    <main className="content-page user-page user-center-page">
      <header className="content-nav">
        <Link to="/map"><BrandMark /></Link>
        <nav>
          <Link to="/map">主地图</Link>
          <Link to="/help">帮助中心</Link>
        </nav>
      </header>

      <section className="user-shell">
        <aside className="user-sidebar archive-panel">
          <div className="user-sidebar-profile">
            <span className="eyebrow">USER DOSSIER</span>
            <div className="profile-avatar-control">
              <button
                type="button"
                className="profile-seal profile-avatar-button"
                aria-label="更换头像"
                title="更换头像"
                disabled={avatarSaving}
                onClick={() => avatarInputRef.current?.click()}
              >
                {user?.avatarUrl ? <img src={user.avatarUrl} alt="当前头像" /> : <span>鉴</span>}
              </button>
              <span className="profile-avatar-edit" aria-hidden="true"><Camera size={13} /></span>
              <input ref={avatarInputRef} className="profile-avatar-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarChange} />
            </div>
            <h1>{user?.nickname ?? '档案共建者'}</h1>
            <p>{user?.email}</p>
          </div>
          <nav className="user-section-nav" aria-label="个人中心导航">
            {userNav.map((item) => (
              <button type="button" key={item.id} className={section === item.id ? 'active' : ''} onClick={() => setSection(item.id)}>
                <strong>{item.label}</strong>
              </button>
            ))}
          </nav>
        </aside>

        <section className="user-workspace">
          {loading && <div className="notice-box">正在读取个人档案...</div>}

          {section === 'dossier' && (
            <div className="user-section">
              <header className="user-section-header">
                <span className="eyebrow">PERSONAL ARCHIVE DASHBOARD</span>
                <h2>个人档案</h2>
                <p>这里汇总收藏、提交、导出申请与下载授权状态。</p>
              </header>
              <div className="dossier-stat-grid">
                <article><span>收藏地点</span><strong>{favoritePlaces.length}</strong><em>来自 favorites 表</em></article>
                <article><span>待审提交</span><strong>{pendingSubmissions}</strong><em>等待管理员核验</em></article>
                <article><span>导出申请</span><strong>{myExports.length}</strong><em>{approvedExports} 项已批准</em></article>
                <article><span>可下载包</span><strong>{myExports.filter((item) => item.fileUrl).length}</strong><em>PDF、原始数据、照片</em></article>
              </div>
            </div>
          )}

          {section === 'submit' && (
            <div className="user-section">
              <header className="user-section-header">
                <span className="eyebrow">SUBMISSION CENTER</span>
                <h2>资料提交</h2>
                <p>提交内容先进入审核队列，管理员通过后再入库。</p>
              </header>
              <div className="submission-layout">
                <Panel className="archive-panel" title="创建资料提交" meta="CREATE">
                  <div className="form-grid detailed-form">
                    <div className="submission-type-switch" aria-label="资料类型">
                      {(['place', 'text', 'media'] as UgcSubmission['submissionType'][]).map((type) => (
                        <button type="button" key={type} className={submissionType === type ? 'active' : ''} onClick={() => setSubmissionType(type)}>{submissionTypeLabel[type]}</button>
                      ))}
                    </div>
                    <TextField label="资料标题" value={submissionForm.title} onChange={(title) => setSubmissionForm((current) => ({ ...current, title }))} />
                    <TextField label="关联地点 / 区域" value={submissionForm.place} onChange={(place) => setSubmissionForm((current) => ({ ...current, place }))} />
                    <TextField label="经纬度或坐标说明" value={submissionForm.coordinates} onChange={(coordinates) => setSubmissionForm((current) => ({ ...current, coordinates }))} />
                    {submissionType === 'media' && <TextField label="图片链接或文件说明" value={submissionForm.imageReference} onChange={(imageReference) => setSubmissionForm((current) => ({ ...current, imageReference }))} />}
                    <TextArea label="资料说明" value={submissionForm.description} onChange={(description) => setSubmissionForm((current) => ({ ...current, description }))} />
                    <TextArea label="来源说明" value={submissionForm.sourceNote} onChange={(sourceNote) => setSubmissionForm((current) => ({ ...current, sourceNote }))} />
                    <Button onClick={handleCreateSubmission}>提交审核</Button>
                  </div>
                </Panel>
                <Panel className="archive-panel" title="我的提交记录" meta="REVIEW STATUS">
                  <div className="submission-cards">
                    {mySubmissions.map((item) => (
                      <article key={item.id} className="submission-card">
                        <div><strong>{item.title}</strong><StatusBadge status={item.status} /></div>
                        <span>{submissionTypeLabel[item.submissionType]} · {String(item.createdAt).slice(0, 10)}</span>
                        <p>{item.sourceNote || '暂无来源说明'}</p>
                      </article>
                    ))}
                  </div>
                </Panel>
              </div>
            </div>
          )}

          {section === 'download' && (
            <div className="user-section">
              <header className="user-section-header">
                <span className="eyebrow">DOWNLOAD & EXPORT</span>
                <h2>资料下载</h2>
              </header>
              <div className="download-layout">
                <Panel className="archive-panel" title="勾选导出点位" meta="SELECT PLACES" actions={<Button onClick={() => setExportDialogOpen(true)} disabled={!selectedPlaceIds.length}>确认申请</Button>}>
                  <button type="button" className="export-place-disclosure" aria-expanded={placePickerOpen} aria-controls="export-place-options" onClick={() => setPlacePickerOpen((open) => !open)}>
                    <span><strong>点位清单</strong><small>{selectedPlaceIds.length ? `已选 ${selectedPlaceIds.length} 项` : `共 ${allPlaces.length} 项`}</small></span>
                    <ChevronDown size={17} aria-hidden="true" />
                  </button>
                  <div className={placePickerOpen ? 'export-place-collapse open' : 'export-place-collapse'}>
                    <div className="export-place-collapse-inner">
                      <div id="export-place-options" className="export-place-list">
                        {allPlaces.map((place) => (
                          <label key={place.id} className="export-place-option">
                            <input type="checkbox" checked={selectedPlaceIds.includes(place.id)} onChange={() => toggleExportPlace(place.id)} />
                            <span>
                              <strong>{place.name}</strong>
                              <em>{place.region} · {place.placeType} · {place.longitude.toFixed(6)}, {place.latitude.toFixed(6)}</em>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </Panel>
                <Panel className="archive-panel" title="审批状态" meta="APPROVAL">
                  <DataTable rows={myExports} columns={[
                    { key: 'requestId', label: '编号' },
                    { key: 'dataScope', label: '范围' },
                    { key: 'reason', label: '理由' },
                    { key: 'status', label: '状态', render: (row) => row.status === 'approved' && row.fileUrl ? <button type="button" className="download-status-button" onClick={() => openDownload(row)}>点击下载</button> : <StatusBadge status={row.status} /> },
                    { key: 'createdAt', label: '创建时间', render: (row) => String(row.createdAt).slice(0, 10) },
                  ]} />
                </Panel>
              </div>
            </div>
          )}

          {section === 'favorites' && (
            <div className="user-section">
              <header className="user-section-header">
                <span className="eyebrow">FAVORITE PLACES</span>
                <h2>我的收藏</h2>
                <p>这里直接读取后端 favorites 表，文化景观、事件点和遗址点都会统一展示。</p>
              </header>
              <div className="favorite-grid">
                {favoritePlaces.map((place) => (
                  <article className="favorite-card" key={place.id}>
                    <TypeBadge type={place.placeType} />
                    <h3>{place.name}</h3>
                    <p>{place.region} · {place.summary}</p>
                    <div><span>{place.startYear}-{place.endYear}</span><Link to="/map">回到地图查看</Link></div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {section === 'settings' && (
            <div className="user-section">
              <header className="user-section-header">
                <span className="eyebrow">PREFERENCES</span>
                <h2>偏好设置</h2>
                <p>地图样式与显示设置。</p>
              </header>
              <Panel className="archive-panel settings-panel" title="地图显示偏好" meta="MAP SETTINGS">
                <div className="setting-group">
                  <span>默认底图</span>
                  {(['terrain', 'satellite', 'archive'] as const).map((item) => (
                    <button className={basemap === item ? 'active' : ''} key={item} onClick={() => { setBasemap(item); setFeedback({ title: '设置成功', message: '设置成功', tone: 'info' }); }}>
                      {item === 'terrain' ? '专题地形' : item === 'satellite' ? '卫星参照' : '历史底图'}
                    </button>
                  ))}
                </div>
                <div className="setting-group">
                  <span>标签密度</span>
                  {(['simple', 'standard', 'detailed'] as const).map((item) => (
                    <button className={labelDensity === item ? 'active' : ''} key={item} onClick={() => { setLabelDensity(item); setFeedback({ title: '设置成功', message: '设置成功', tone: 'info' }); }}>
                      {item === 'simple' ? '简洁' : item === 'standard' ? '标准' : '详细'}
                    </button>
                  ))}
                </div>
              </Panel>
            </div>
          )}
        </section>
      </section>

      {exportDialogOpen && (
        <div className="feedback-overlay" role="presentation" onClick={() => setExportDialogOpen(false)}>
          <section className="export-request-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <header>
              <span className="eyebrow">EXPORT REQUEST</span>
              <h2>确认导出申请</h2>
              <p>已选择 {selectedPlaces.length} 个点位。请补充申请理由，管理员审批通过后即可下载。</p>
            </header>
            <div className="selected-export-list">
              {selectedPlaces.map((place) => <span key={place.id}>{place.name}</span>)}
            </div>
            <TextArea label="申请理由" value={exportReason} onChange={setExportReason} />
            <div className="dialog-actions">
              <Button variant="secondary" onClick={() => setExportDialogOpen(false)}>取消</Button>
              <Button onClick={confirmExportRequest}>提交申请</Button>
            </div>
          </section>
        </div>
      )}
      <FeedbackDialog open={!!feedback} title={feedback?.title ?? ''} message={feedback?.message ?? ''} tone={feedback?.tone} onClose={() => setFeedback(null)} />
    </main>
  );
}
