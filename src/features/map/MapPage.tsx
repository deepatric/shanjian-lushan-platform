import { useEffect, useMemo, useState } from 'react';
import { Archive, Bookmark, ChevronLeft, ChevronRight, Filter, ImagePlus, Images, LocateFixed, LogOut, Moon, Music2, Navigation, Search, Sun, VolumeX, X } from 'lucide-react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { BrandMark, Button, FeedbackDialog, Panel, TextField, TypeBadge } from '../../components/ui';
import { markerIconByType } from '../../config/map';
import { addFavorite, removeFavorite } from '../../services/api';
import { useAppStore } from '../../stores/useAppStore';
import type { Place, PlaceDetail, PlaceType } from '../../types/domain';
import { MapboxScene } from './MapboxScene';
import { useHistoricalSoundscape } from './useHistoricalSoundscape';

const typeLabels: Record<PlaceType, { label: string; countLabel: string }> = {
  battle: { label: '战斗地点', countLabel: '战斗点' },
  event: { label: '事件地点', countLabel: '事件点' },
  heritage: { label: '遗址地点', countLabel: '遗址点' },
};

const keywords = ['庐山会议', '战斗', '抗日宣传', '交通路站', '群众组织', '学校教育', '医疗救护'];
const years = Array.from({ length: 9 }, (_, i) => 1937 + i);
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const TIMELINE_START_UTC = Date.UTC(1937, 0, 1);
const TIMELINE_END_UTC = Date.UTC(1945, 11, 31);
const totalTimelineWeeks = Math.floor((TIMELINE_END_UTC - TIMELINE_START_UTC) / WEEK_MS);
const weekTicks = Array.from({ length: totalTimelineWeeks + 1 }, (_, i) => i);

function clampWeek(week: number) {
  return Math.max(0, Math.min(totalTimelineWeeks, week));
}

function weekForDate(year: number, month = 1, day = 1) {
  return clampWeek(Math.round((Date.UTC(year, month - 1, day) - TIMELINE_START_UTC) / WEEK_MS));
}

function yearForWeek(week: number) {
  return new Date(TIMELINE_START_UTC + clampWeek(week) * WEEK_MS).getUTCFullYear();
}

function timelinePercentForWeek(week: number) {
  return `${(clampWeek(week) / totalTimelineWeeks) * 100}%`;
}

function formatWeekDate(week: number) {
  const date = new Date(TIMELINE_START_UTC + clampWeek(week) * WEEK_MS);
  return `${date.getUTCFullYear()}.${String(date.getUTCMonth() + 1).padStart(2, '0')}.${String(date.getUTCDate()).padStart(2, '0')}`;
}

function weekOfYearLabel(week: number) {
  const date = new Date(TIMELINE_START_UTC + clampWeek(week) * WEEK_MS);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.floor((date.getTime() - yearStart) / WEEK_MS) + 1;
}

const nationalMilestones = [
  { id: 'national-1937-07', year: 1937, month: 7, title: '\u4e03\u4e03\u4e8b\u53d8' },
  { id: 'national-1938-03', year: 1938, month: 3, title: '\u53f0\u513f\u5e84\u6218\u5f79' },
  { id: 'national-1940-08', year: 1940, month: 8, title: '\u767e\u56e2\u5927\u6218' },
  { id: 'national-1945-08', year: 1945, month: 8, title: '\u65e5\u672c\u6295\u964d' },
];

type PlaybackMode = 'paused' | 'week1' | 'week3' | 'year';

function imagesForPlace(place: PlaceDetail) {
  return place.media
    .filter((item) => item.url && !item.isAiGenerated)
    .map((item) => ({
      title: item.title,
      url: item.url as string,
    }));
}

export function MapPage() {
  const navigate = useNavigate();
  const compactViewport = typeof window !== 'undefined' && window.innerWidth <= 760;
  const [filterOpen, setFilterOpen] = useState(!compactViewport);
  const [detailOpen, setDetailOpen] = useState(!compactViewport);
  const [filterClosing, setFilterClosing] = useState(false);
  const [detailClosing, setDetailClosing] = useState(false);
  const {
    places,
    regions,
    filters,
    selectedPlace,
    timeline,
    acts,
    typeTotals,
    activeYear,
    basemap,
    labelDensity,
    uiTheme,
    user,
    loadInitial,
    setKeyword,
    setTypes,
    toggleType,
    setRegion,
    setTimeRange,
    setActiveYear,
    setPlaying,
    setUiTheme,
    selectPlace,
    setUserFavorites,
  } = useAppStore();

  const [activeWeek, setActiveWeek] = useState(() => weekForDate(activeYear));
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>('paused');
  const [mapFocus, setMapFocus] = useState<{ id: string; token: number }>();
  const [feedback, setFeedback] = useState<{ title: string; message: string; tone?: 'success' | 'warning' | 'error' | 'info' } | null>(null);
  const currentAct = useMemo(() => {
    const currentDate = TIMELINE_START_UTC + activeWeek * WEEK_MS;
    return [...acts]
      .filter((act) => Date.parse(`${act.startDate}T00:00:00Z`) <= currentDate)
      .sort((a, b) => Date.parse(b.startDate) - Date.parse(a.startDate))[0] ?? acts[0];
  }, [activeWeek, acts]);
  const { musicEnabled, soundscapeLabel, toggleMusic, playPanelSlide } = useHistoricalSoundscape(currentAct?.actNo ?? 1);
  const timelineFrames = useMemo(() => timeline.flatMap((bucket) => bucket.keyframes), [timeline]);
  const nearestTimelineFrame = useMemo(() => {
    const current = timelineFrames
      .filter((frame) => weekForDate(frame.year, frame.month) <= activeWeek)
      .sort((a, b) => weekForDate(b.year, b.month) - weekForDate(a.year, a.month))[0];
    return current ?? timelineFrames[0];
  }, [activeWeek, timelineFrames]);
  const selectedMilestone = nationalMilestones.find((item) => weekForDate(item.year, item.month) === activeWeek);
  const activeWeekCaption = `${formatWeekDate(activeWeek)} \u00b7 ${activeYear}\u5e74\u7b2c${weekOfYearLabel(activeWeek)}\u5468`;
  const activeNarration = selectedMilestone
    ? `${selectedMilestone.title}：全国抗战进程中的重要时间节点。`
    : nearestTimelineFrame
      ? `${nearestTimelineFrame.title}：${nearestTimelineFrame.description}`
      : '拖动时间轴，查看庐山及赣北抗战事件旁白。';

  const commitActiveWeek = (week: number) => {
    const nextWeek = clampWeek(week);
    setActiveWeek(nextWeek);
    const nextYear = yearForWeek(nextWeek);
    if (nextYear !== activeYear) {
      setActiveYear(nextYear);
      setTimeRange(nextYear, nextYear);
    }
  };

  useEffect(() => { void loadInitial(); }, [loadInitial]);
  useEffect(() => { setActiveWeek(weekForDate(activeYear)); }, [activeYear]);

  useEffect(() => {
    setPlaying(playbackMode !== 'paused');
  }, [playbackMode, setPlaying]);

  useEffect(() => {
    if (playbackMode === 'paused') return;
    const step = playbackMode === 'week1' ? 1 : playbackMode === 'week3' ? 3 : 52;
    const interval = playbackMode === 'year' ? 900 : 640;
    const timer = window.setInterval(() => {
      setActiveWeek((current) => {
        const nextWeek = current + step > totalTimelineWeeks ? 0 : current + step;
        const nextYear = yearForWeek(nextWeek);
        if (nextYear !== yearForWeek(current)) {
          setActiveYear(nextYear);
        }
        return nextWeek;
      });
    }, interval);
    return () => window.clearInterval(timer);
  }, [playbackMode, setActiveYear]);

  const playbackLabel = playbackMode === 'paused'
    ? '播放叙事：单击一倍速度，双击三倍速度'
    : playbackMode === 'week1'
      ? '一倍速度：单击暂停，双击三倍速度'
      : playbackMode === 'week3'
        ? '三倍速度：单击切换一年步长'
        : '一年步长：单击暂停';
  const playbackIcon = playbackMode === 'paused' ? '▶' : playbackMode === 'week1' ? '1×' : playbackMode === 'week3' ? '3×' : '1Y';
  const advancePlaybackMode = () => {
    setPlaybackMode((current) => {
      if (current === 'paused') return 'week1';
      if (current === 'week3') return 'year';
      return 'paused';
    });
  };

  const showFilter = () => {
    playPanelSlide('in');
    setDetailOpen(compactViewport ? false : detailOpen);
    setFilterClosing(false);
    setFilterOpen(true);
  };
  const hideFilter = () => {
    playPanelSlide('out');
    setFilterClosing(true);
    window.setTimeout(() => {
      setFilterOpen(false);
      setFilterClosing(false);
    }, 220);
  };
  const showDetail = () => {
    playPanelSlide('in');
    setFilterOpen(compactViewport ? false : filterOpen);
    setDetailClosing(false);
    setDetailOpen(true);
  };
  const hideDetail = () => {
    playPanelSlide('out');
    setDetailClosing(true);
    window.setTimeout(() => {
      setDetailOpen(false);
      setDetailClosing(false);
    }, 220);
  };

  const handleFavoriteClean = async (place: Place) => {
    if (!user) {
      setFeedback({ title: '请先登录', message: '请先登录', tone: 'warning' });
      return;
    }
    const isFavorite = user.favorites.includes(place.id);
    try {
      const result = isFavorite ? await removeFavorite(place.id) : await addFavorite(place.id);
      setUserFavorites(result.favorites);
      setFeedback({
        title: isFavorite ? '取消收藏成功' : '收藏成功',
        message: isFavorite ? '取消收藏成功' : '收藏成功',
      });
    } catch {
      setFeedback({ title: '收藏失败', message: '收藏失败', tone: 'error' });
    }
  };

  return (
    <main className="map-page">
      <TopNavigation
        keyword={filters.keyword}
        onKeywordChange={setKeyword}
        uiTheme={uiTheme}
        onThemeChange={() => setUiTheme(uiTheme === 'dark' ? 'light' : 'dark')}
        musicEnabled={musicEnabled}
        onMusicToggle={() => void toggleMusic()}
      />
      <MapboxScene
        places={places}
        selectedId={playbackMode !== 'paused' ? undefined : selectedPlace?.id}
        focusRequest={mapFocus}
        activeYear={activeYear}
        basemap={basemap}
        labelDensity={labelDensity}
        onSelect={(id) => {
          showDetail();
          void selectPlace(id);
        }}
      />

      <div className={`map-act-plaque ${filterOpen ? 'beside-filter' : ''}`} aria-live="polite">
        <span>第{currentAct?.actNo ?? 1}幕</span>
        <div>
          <strong>{currentAct?.title.replace(/^第[^幕]+幕[：:]\s*/, '').replace(/（.*$/, '') ?? '庐山牯岭，国共定策'}</strong>
          <small>{currentAct?.startDate.slice(0, 4) ?? '1937'}—{currentAct?.endDate.slice(0, 4) ?? '1938'} · {soundscapeLabel}</small>
        </div>
      </div>

      {filterOpen ? (
        <Panel
          className={`left-console edge-surface archive-panel newspaper-panel left-fold ${filterClosing ? 'panel-leaving' : 'panel-entering'}`}
          title={'\u641c\u7d22\u4e0e\u7b5b\u9009'}
          meta="SEARCH / FILTER"
          actions={<button type="button" className="panel-close icon-button" aria-label="关闭搜索筛选" onClick={hideFilter}><X size={16} /></button>}
        >
        <div className="filter-body">
          <TextField label="全局检索" placeholder="搜索点位、描述或事件正文…" value={filters.keyword} onChange={setKeyword} />

          <section className="console-section">
            <div className="section-row"><span>地点类型</span><div className="section-actions"><button onClick={() => setTypes(['battle', 'event', 'heritage'])}>全选</button><button onClick={() => setTypes([])}>清空</button></div></div>
            <div className="type-grid">
              {(['event', 'heritage', 'battle'] as PlaceType[]).map((type) => (
                <button key={type} className={filters.types.includes(type) ? 'active' : ''} onClick={() => toggleType(type)}>
                  <img src={markerIconByType[type]} alt="" />
                  <span>{typeLabels[type].label}</span>
                  <strong>{typeTotals[type]}</strong>
                </button>
              ))}
            </div>
          </section>

          <section className="console-section">
            <div className="section-row"><span>时间范围</span><strong>{activeYear}</strong></div>
            <input className="range-control" min="0" max={totalTimelineWeeks} step="1" type="range" value={activeWeek} onChange={(event) => commitActiveWeek(Number(event.target.value))} aria-label={'\u6309\u5468\u8c03\u6574\u65f6\u95f4\u8303\u56f4'} />
            <div className="time-pills">
              <button onClick={() => setTimeRange(1937, 1945)}>全部</button>
              <button onClick={() => setTimeRange(1937, 1939)}>1937-1939</button>
              <button onClick={() => setTimeRange(1940, 1942)}>1940-1942</button>
              <button onClick={() => setTimeRange(1943, 1945)}>1943-1945</button>
            </div>
          </section>

          <section className="console-section">
            <div className="section-row"><span>所属区域</span><button onClick={() => setRegion(undefined)}>全部</button></div>
            <div className="region-tree">
              {regions.map((region) => <button className={filters.regionId === region.id ? 'active' : ''} key={region.id} onClick={() => setRegion(region.id)}>› {region.name} <span>{region.count}</span></button>)}
            </div>
          </section>

          <section className="console-section">
            <div className="section-row"><span>关键词</span></div>
            <div className="keyword-cloud">{keywords.map((item) => <button key={item} onClick={() => setKeyword(item)}>{item}</button>)}</div>
          </section>

          <section className="console-section result-section">
            <div className="section-row"><span>检索结果</span><small>{places.length} 条</small></div>
            <div className="result-list compact">
              {places.slice(0, 40).map((place) => (
                <div className="result-row" key={place.id}>
                  <button className={selectedPlace?.id === place.id ? 'result-item active' : 'result-item'} onClick={() => { showDetail(); void selectPlace(place.id); }}>
                    <strong>{place.name}</strong>
                    <small>{place.actNumbers?.length ? `第${place.actNumbers.join('、')}幕｜` : '常设景观｜'}{place.region}｜{place.summary}</small>
                  </button>
                  <button
                    type="button"
                    className="result-navigate icon-button"
                    aria-label={`导航至${place.name}`}
                    title={`在地图上定位：${place.name}`}
                    onClick={() => {
                      showDetail();
                      setMapFocus((current) => ({ id: place.id, token: (current?.token ?? 0) + 1 }));
                      void selectPlace(place.id);
                    }}
                  >
                    <Navigation size={15} strokeWidth={1.9} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <div className="console-actions">
            <Button variant="secondary" onClick={() => setKeyword('')}>重置</Button>
            <Button onClick={() => user ? navigate('/me') : navigate('/login')}>上传资料</Button>
          </div>
        </div>
        </Panel>
      ) : (!compactViewport || !detailOpen) ? (
        <button type="button" className="filter-reopen panel-trigger" onClick={showFilter}><Filter size={15} /><span>筛选</span></button>
      ) : null}

      <div className="map-legend-inline" aria-label="地图点位图例">
        {(['battle', 'event', 'heritage'] as PlaceType[]).map((type) => (
          <div className="legend-row" key={type}><img src={markerIconByType[type]} alt="" /><span>{typeLabels[type].countLabel}</span></div>
        ))}
      </div>

      {detailOpen ? (
        <DetailDrawer
          place={selectedPlace}
          closing={detailClosing}
          onClose={hideDetail}
          signedIn={!!user}
          isFavorite={!!selectedPlace && !!user?.favorites.includes(selectedPlace.id)}
          onFavorite={handleFavoriteClean}
          onShowSources={(place) => setFeedback({
            title: '来源与坐标信息',
            message: `${place.baseInfo}。坐标：${place.longitude.toFixed(6)}, ${place.latitude.toFixed(6)}。`,
            tone: 'info',
          })}
          onSupplement={(place) => {
            const params = new URLSearchParams({
              section: 'submit',
              type: 'media',
              pointId: place.id,
              title: `${place.name}图片补充`,
              place: place.name,
              coordinates: `${place.longitude.toFixed(6)}, ${place.latitude.toFixed(6)}`,
              description: `为${place.name}补充可核验图片。`,
            });
            const target = `/me?${params.toString()}`;
            navigate(user ? target : `/login?returnTo=${encodeURIComponent(target)}`);
          }}
        />
      ) : (!compactViewport || !filterOpen) ? (
        selectedPlace && <button type="button" className="detail-reopen panel-trigger" onClick={showDetail}><Archive size={15} /><span>档案</span></button>
      ) : null}

      <Panel className="bottom-timeline edge-surface archive-panel timeline-fold">
        <div className="timeline-continuous">
          <button className="timeline-arrow icon-button" aria-label="上一周" onClick={() => commitActiveWeek(activeWeek - 1)}><ChevronLeft size={18} /></button>
          <div className="timeline-year-start"><strong>1937</strong><span>烽火初起</span></div>
          <div className="timeline-core">
            <div className="timeline-top">
              <span className="timeline-sound-label"><Music2 size={12} />{musicEnabled ? soundscapeLabel : '声景未启用'}</span>
              <button
                type="button"
                className={playbackMode === 'paused' ? 'timeline-play-toggle' : `timeline-play-toggle playing mode-${playbackMode}`}
                aria-label={playbackLabel}
                data-tooltip={playbackLabel}
                onClick={(event) => {
                  if (event.detail >= 2) {
                    setPlaybackMode('week3');
                    return;
                  }
                  advancePlaybackMode();
                }}
                onDoubleClick={(event) => {
                  event.preventDefault();
                  setPlaybackMode('week3');
                }}
              >
                <span aria-hidden="true">{playbackIcon}</span>
              </button>
            </div>
            <div className="ruler-track" aria-label="1937 至 1945 连续时间轴">
              <div className="ruler-line" />
              {weekTicks.map((tick) => <i key={tick} className={tick % 52 === 0 ? 'major' : tick % 4 === 0 ? 'month' : 'week'} style={{ left: timelinePercentForWeek(tick) }} />)}
              <input className="week-range" min="0" max={totalTimelineWeeks} step="1" type="range" value={activeWeek} onChange={(event) => commitActiveWeek(Number(event.target.value))} aria-label={'\u6309\u5468\u62d6\u52a81937\u81f31945\u8fde\u7eed\u65f6\u95f4\u8f74'} />
              {years.map((year) => <button key={year} className={activeYear === year ? 'year-dot active' : 'year-dot'} style={{ left: timelinePercentForWeek(weekForDate(year)) }} onClick={() => commitActiveWeek(weekForDate(year))}>{year}</button>)}
              {nationalMilestones.map((frame) => (
                <button key={frame.id} className="event-dot national" style={{ left: timelinePercentForWeek(weekForDate(frame.year, frame.month)) }} onClick={() => commitActiveWeek(weekForDate(frame.year, frame.month))}>
                  <span>{frame.month ? `${frame.month}月` : frame.year}</span>
                  <em>{frame.title}</em>
                </button>
              ))}
            </div>
            <div className="timeline-caption">{activeWeekCaption}</div>
            <div className="timeline-narration" aria-live="polite">{activeNarration}</div>
          </div>
          <div className="timeline-year-end"><strong>1945</strong><span>胜利之年</span></div>
          <button className="timeline-arrow icon-button" aria-label="下一周" onClick={() => commitActiveWeek(activeWeek + 1)}><ChevronRight size={18} /></button>
        </div>
      </Panel>
      <FeedbackDialog open={!!feedback} title={feedback?.title ?? ''} message={feedback?.message ?? ''} tone={feedback?.tone} onClose={() => setFeedback(null)} />
    </main>
  );
}

function TopNavigation({
  keyword,
  onKeywordChange,
  uiTheme,
  onThemeChange,
  musicEnabled,
  onMusicToggle,
}: {
  keyword: string;
  onKeywordChange: (value: string) => void;
  uiTheme: 'light' | 'dark';
  onThemeChange: () => void;
  musicEnabled: boolean;
  onMusicToggle: () => void;
}) {
  const { user, logout } = useAppStore();
  return (
    <header className="map-nav edge-surface top-fold">
      <Link to="/map" className="brand-link"><BrandMark compact /></Link>
      <nav>
        <NavLink to="/map">地图</NavLink>
        <NavLink to="/help">帮助</NavLink>
        {user?.role === 'admin' && <NavLink to="/admin/dashboard">管理后台</NavLink>}
      </nav>
      <div className="nav-search"><Search size={15} aria-hidden="true" /><input aria-label="顶部全局搜索" placeholder="搜索点位、事件正文或地点描述…" value={keyword} onChange={(event) => onKeywordChange(event.target.value)} /></div>
      <div className="nav-actions">
        {user ? <Link to="/me">个人中心</Link> : <Link to="/login">登录</Link>}
        <button type="button" className="nav-icon-control" aria-label={uiTheme === 'dark' ? '切换亮色界面' : '切换暗色界面'} title={uiTheme === 'dark' ? '切换亮色界面' : '切换暗色界面'} onClick={onThemeChange}>
          {uiTheme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        <button type="button" className={musicEnabled ? 'nav-icon-control active' : 'nav-icon-control'} aria-label={musicEnabled ? '关闭背景音乐' : '开启背景音乐'} title={musicEnabled ? '关闭背景音乐' : '开启背景音乐'} onClick={onMusicToggle}>
          {musicEnabled ? <Music2 size={15} /> : <VolumeX size={15} />}
        </button>
        {user && <button className="nav-logout" onClick={logout}><LogOut size={14} /><span>退出</span></button>}
      </div>
    </header>
  );
}

function DetailDrawer({
  place,
  signedIn,
  isFavorite,
  closing,
  onClose,
  onFavorite,
  onShowSources,
  onSupplement,
}: {
  place?: PlaceDetail;
  signedIn: boolean;
  isFavorite: boolean;
  closing: boolean;
  onClose: () => void;
  onFavorite: (place: Place) => void;
  onShowSources: (place: PlaceDetail) => void;
  onSupplement: (place: PlaceDetail) => void;
}) {
  const [galleryOpen, setGalleryOpen] = useState(false);
  useEffect(() => { setGalleryOpen(false); }, [place?.id]);
  if (!place) return null;
  const images = imagesForPlace(place);
  const detailEvents = place.timelineEvents;
  return (
    <>
      <Panel
        className={`detail-drawer edge-surface archive-panel newspaper-panel right-fold ${closing ? 'panel-leaving' : 'panel-entering'}`}
        title={place.name}
        meta="ARCHIVE DRAWER"
        actions={<button type="button" className="panel-close icon-button" aria-label="关闭地点详情" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onClose(); }}><X size={16} /></button>}
      >
        <div className="detail-body">
          {images.length ? (
            <button type="button" className="media-gate" onClick={() => setGalleryOpen(true)}>
              <Images size={24} />
              <strong>查看图片</strong>
              <span>{images.length} 张</span>
            </button>
          ) : (
            <div className="media-empty">
              <Images size={24} />
              <strong>暂无图片</strong>
              <button type="button" className="quick-supplement" onClick={() => onSupplement(place)}><ImagePlus size={15} />一键补充</button>
            </div>
          )}
          <div className="detail-meta"><TypeBadge type={place.placeType} /><span>{place.region}</span><span>{place.baseInfo}</span></div>
          <div className="act-stamps">
            {place.actNumbers?.length
              ? place.actNumbers.map((actNo) => <span key={actNo}>第{actNo}幕</span>)
              : <span>常设景观</span>}
          </div>
          <h3>简述</h3>
          <p>{place.summary}</p>
          <h3>事件目录</h3>
          {detailEvents.length ? (
            <ol className="event-list numbered-events">
              {detailEvents.map((event, index) => (
                <li key={event.id}>
                  <b>{index + 1}</b>
                  <div><strong>{event.startTimeRaw}</strong><span>{event.title}</span></div>
                </li>
              ))}
            </ol>
          ) : <p className="empty-copy">该文化景观点暂未关联具体历史事件。</p>}
          <div className="detail-actions">
            <button type="button" className={isFavorite ? 'btn btn-primary favorite-action active' : 'btn btn-primary favorite-action'} onClick={() => onFavorite(place)}>
              <Bookmark size={14} />
              {signedIn ? (isFavorite ? '已收藏' : '收藏点位') : '登录后收藏'}
            </button>
            <Button variant="secondary" onClick={() => onShowSources(place)}><LocateFixed size={14} />来源与坐标</Button>
          </div>
        </div>
      </Panel>
      {galleryOpen && (
        <div className="image-viewer-backdrop" role="dialog" aria-modal="true" aria-label={`${place.name}图片`} onClick={() => setGalleryOpen(false)}>
          <div className="image-viewer" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="image-viewer-close icon-button" aria-label="关闭图片" onClick={() => setGalleryOpen(false)}><X size={18} /></button>
            {images.map((image) => <img key={image.url} src={image.url} alt={image.title} referrerPolicy="no-referrer" />)}
          </div>
        </div>
      )}
    </>
  );
}
