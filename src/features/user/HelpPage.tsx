import { Link } from 'react-router-dom';
import { BrandMark, Panel } from '../../components/ui';

export function HelpPage() {
  return (
    <main className="content-page help-page">
      <header className="content-nav">
        <Link to="/map"><BrandMark /></Link>
        <nav>
          <Link to="/about">平台介绍</Link>
          <Link to="/map">主地图</Link>
          <Link to="/login">登录</Link>
        </nav>
      </header>
      <section className="help-hero">
        <span className="eyebrow">HELP CENTER</span>
        <h1>帮助</h1>
      </section>
      <section className="help-grid">
        <Panel title="进入主地图" meta="01">
          <p>无需登录即可进入主地图。地图中央呈现庐山及周边地形，左右两侧分别用于搜索筛选和阅读点位档案。</p>
        </Panel>
        <Panel title="搜索并定位" meta="02">
          <p>在顶部或左侧搜索框输入点位名称、地点描述或事件内容。点击结果旁的导航图标，地图会直接移动到对应位置。</p>
        </Panel>
        <Panel title="筛选点位" meta="03">
          <p>按战争事件、事务事件和遗址地点筛选地图内容，也可以结合时间范围缩小结果。全部取消选择时，地图不显示点位。</p>
        </Panel>
        <Panel title="浏览地图" meta="04">
          <p>拖动地图可平移视野，滚轮用于缩放。放大后会逐步显示更多点位；点击新点位时，当前比例尺和观察角度会保持不变。</p>
        </Panel>
        <Panel title="阅读点位档案" meta="05">
          <p>点击地图标记打开档案栏，查看位置、简介与所属幕。同一地点发生的多个事件会按时间顺序编号排列。</p>
        </Panel>
        <Panel title="切换历史幕" meta="06">
          <p>地图左上角显示当前所处的历史幕。拖动时间轴或选择年份后，幕标题、地图点位与叙事内容会同步变化。</p>
        </Panel>
        <Panel title="播放时间线" meta="07">
          <p>使用底部播放按钮自动推进历史时间。再次操作可切换播放节奏或暂停，旁白与背景音乐会随阶段变化。</p>
        </Panel>
        <Panel title="收藏地点" meta="08">
          <p>登录后可收藏文化景观、事件点和遗址点。所有收藏集中在个人档案中，之后可随时返回地图继续查看。</p>
        </Panel>
        <Panel title="补充资料" meta="09">
          <p>点位暂无图片时，可在档案栏点击一键补充。系统会自动填写关联地点，再提交照片、文字或位置线索。</p>
        </Panel>
        <Panel title="申请导出" meta="10">
          <p>在个人中心勾选需要的点位并提交申请。审批通过后即可下载授权资料，并在申请记录中查看处理状态。</p>
        </Panel>
      </section>
    </main>
  );
}
