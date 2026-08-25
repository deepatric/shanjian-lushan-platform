import { Archive, ArrowRight, Clock3, MapPinned, Moon, Search, Sun, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BrandMark } from '../../components/ui';
import { useAppStore } from '../../stores/useAppStore';

const publicJourney = [
  {
    icon: Search,
    eyebrow: '01 · 全局搜索',
    title: '从一个名字或一段往事出发',
    text: '搜索点位名称、地点描述或事件内容，结果会直接带你回到地图上的具体位置。',
  },
  {
    icon: Clock3,
    eyebrow: '02 · 时间回望',
    title: '沿时间线读懂事件前后',
    text: '从抗战初起到胜利之年逐幕浏览，同一地点发生的多段事件也会依次展开。',
  },
  {
    icon: Archive,
    eyebrow: '03 · 个人档案',
    title: '收藏地点，也保存探索进度',
    text: '文化景观、战争事件和历史遗址都可以收藏，随时回到个人档案继续查看。',
  },
];

export function AboutPage() {
  const { uiTheme, setUiTheme } = useAppStore();
  const nextThemeLabel = uiTheme === 'dark' ? '切换亮色界面' : '切换暗色界面';

  return (
    <main className="content-page about-page">
      <header className="content-nav about-nav">
        <Link to="/map" aria-label="返回主地图"><BrandMark /></Link>
        <nav>
          <Link to="/map">主地图</Link>
          <Link to="/help">帮助中心</Link>
          <Link to="/login">登录</Link>
          <button
            type="button"
            className="about-theme-toggle icon-button"
            aria-label={nextThemeLabel}
            title={nextThemeLabel}
            onClick={() => setUiTheme(uiTheme === 'dark' ? 'light' : 'dark')}
          >
            {uiTheme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </nav>
      </header>

      <section className="about-hero">
        <div className="about-copy">
          <span className="eyebrow">LUSHAN MEMORY ARCHIVE</span>
          <h1><strong>山鉴</strong><span>让庐山抗战记忆有址可循</span></h1>
          <p>
            打开地图，从一处旧址、一场战斗或一段往事出发。查看它发生在哪里，沿时间线理解事件前后，把感兴趣的地点收入个人档案，也为尚未完整的记忆补上一张照片或一条线索。
          </p>
          <div className="about-actions">
            <Link className="btn btn-primary" to="/map">开始地图寻迹<ArrowRight size={17} /></Link>
            <Link className="about-text-link" to="/help">查看使用帮助</Link>
          </div>
        </div>
        <figure className="about-visual">
          <img src={`${import.meta.env.BASE_URL}assets/about/platform-map-real-v1.png`} alt="山鉴主地图真实界面，展示地点筛选、点位档案与历史时间线" />
          <figcaption><MapPinned size={15} />真实界面 · 地图寻迹与时间叙事</figcaption>
        </figure>
      </section>

      <section className="about-journey" aria-labelledby="about-journey-title">
        <header className="about-section-heading">
          <span className="eyebrow">HOW TO EXPLORE</span>
          <h2 id="about-journey-title">循着三步，走近一段山河记忆</h2>
        </header>
        <div className="about-journey-grid">
          {publicJourney.map(({ icon: Icon, eyebrow, title, text }) => (
            <article className="about-journey-item" key={title}>
              <Icon size={22} aria-hidden="true" />
              <span>{eyebrow}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="about-story about-story-archive">
        <figure className="about-story-visual">
          <img src={`${import.meta.env.BASE_URL}assets/about/platform-archive-real-v1.png`} alt="山鉴个人档案真实界面，展示收藏与申请状态" />
          <figcaption>真实界面 · 个人档案</figcaption>
        </figure>
        <div className="about-story-copy">
          <Archive size={26} aria-hidden="true" />
          <span className="eyebrow">PERSONAL ARCHIVE</span>
          <h2>把想继续了解的地点，收进自己的档案</h2>
          <p>登录后即可收藏文化景观、事件点和遗址点。收藏、资料提交与下载申请集中呈现，不必重新翻找，也不会打断地图上的探索。</p>
          <ul>
            <li>收藏不同类型的历史地点</li>
            <li>查看资料提交与申请进度</li>
            <li>从个人档案快速返回主地图</li>
          </ul>
          <Link className="about-inline-link" to="/login">登录个人档案<ArrowRight size={16} /></Link>
        </div>
      </section>

      <section className="about-story about-story-contribution">
        <div className="about-story-copy">
          <Upload size={26} aria-hidden="true" />
          <span className="eyebrow">PUBLIC CONTRIBUTION</span>
          <h2>让散落的照片与线索，回到它们发生的地方</h2>
          <p>遇到缺少图片的点位，可以一键进入补全申请，地点信息会自动带入。你也可以提交文字、影像与位置线索，审核后再进入公开档案。</p>
          <ul>
            <li>从点位档案一键发起补全</li>
            <li>提交照片、文字和位置线索</li>
            <li>在个人档案查看处理状态</li>
          </ul>
          <Link className="about-inline-link" to="/register">加入公众共建<ArrowRight size={16} /></Link>
        </div>
        <figure className="about-story-visual">
          <img src={`${import.meta.env.BASE_URL}assets/about/platform-contribution-real-v1.png`} alt="山鉴资料提交真实界面，展示点位资料补充与审核记录" />
          <figcaption>真实界面 · 资料补充</figcaption>
        </figure>
      </section>

      <section className="about-closing">
        <MapPinned size={25} aria-hidden="true" />
        <div><span className="eyebrow">START EXPLORING</span><h2>从地图上的第一处坐标开始</h2></div>
        <Link className="btn btn-primary" to="/map">进入主地图<ArrowRight size={17} /></Link>
      </section>
    </main>
  );
}
