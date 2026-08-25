import { FormEvent, useState } from 'react';
import { MapPinned, Moon, Sun } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BrandMark, Button, FeedbackDialog, TextField } from '../../components/ui';
import { useAppStore } from '../../stores/useAppStore';

export function AuthPage({ mode }: { mode: 'login' | 'register' | 'admin' }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, register, uiTheme, setUiTheme } = useAppStore();
  const [email, setEmail] = useState(mode === 'admin' ? 'admin@shanjian.local' : 'viewer@example.com');
  const [nickname, setNickname] = useState('档案共建者');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState<{ title: string; message: string; tone?: 'success' | 'warning' | 'error' | 'info' } | null>(null);
  const isRegister = mode === 'register';
  const isAdmin = mode === 'admin';

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (isRegister && password !== confirm) {
      setFeedback({ title: '注册信息有误', message: '两次输入的密码不一致，请重新确认。', tone: 'warning' });
      setError('两次输入的密码不一致');
      return;
    }
    try {
      const user = isRegister ? await register(email, nickname, password) : await login(email, password, isAdmin ? 'admin' : 'user');
      const returnTo = searchParams.get('returnTo');
      navigate(user.role === 'admin' ? '/admin/dashboard' : returnTo?.startsWith('/') ? returnTo : '/me');
    } catch (caught) {
      const raw = caught instanceof Error ? caught.message : '';
      let message = isRegister ? '注册失败，请检查填写内容。' : '账号或密码不正确。';
      try {
        const parsed = JSON.parse(raw) as { message?: string; code?: string };
        if (parsed.code === 'EMAIL_EXISTS') message = '该邮箱已经注册，请直接登录。';
        else if (parsed.message) message = parsed.message;
      } catch { /* 使用简明的本地化提示 */ }
      setFeedback({ title: isRegister ? '注册失败' : '登录失败', message, tone: 'error' });
      setError(message);
    }
  }

  return (
    <main className={`auth-page ${isRegister ? 'register' : ''}`}>
      <header className="auth-header">
        <BrandMark />
        <nav>
          <Link to="/about">平台介绍</Link>
          <Link to="/help">帮助中心</Link>
          <Link to="/map">返回地图</Link>
          <button
            type="button"
            className="auth-theme-toggle icon-button"
            aria-label={uiTheme === 'dark' ? '切换亮色界面' : '切换暗色界面'}
            title={uiTheme === 'dark' ? '切换亮色界面' : '切换暗色界面'}
            onClick={() => setUiTheme(uiTheme === 'dark' ? 'light' : 'dark')}
          >
            {uiTheme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </nav>
      </header>
      <section className="auth-hero">
        <div className="auth-landscape-copy">
          <span className="eyebrow">LUSHAN MEMORY ARCHIVE</span>
          <h2><span>山河有址，</span><span>记忆可循</span></h2>
          <p>沿时间与地理坐标，重访庐山抗战文化景观。</p>
          <small>29°34′N · 115°58′E</small>
        </div>
        <form className="auth-card" onSubmit={onSubmit}>
          <header className="auth-card-heading">
            <span className="auth-logo-pair" aria-hidden="true">
              <img className="brand-logo-light" src={`${import.meta.env.BASE_URL}assets/brand/shanjian-logo-mark-b.webp`} alt="" />
              <img className="brand-logo-dark" src={`${import.meta.env.BASE_URL}assets/brand/shanjian-logo-mark-b-dark.webp`} alt="" />
            </span>
            <div>
              <span className="eyebrow">ACCESS DOSSIER</span>
              <h1>{isRegister ? '创建账号' : isAdmin ? '管理员登录' : '登录'}</h1>
            </div>
          </header>
          <p className="auth-card-intro">{isRegister ? '建立个人档案，参与资料共建' : isAdmin ? '授权人员进入数据管理后台' : '循山河旧迹，续一卷未完的记忆'}</p>
          {isAdmin ? (
            <div className="role-tabs"><Link to="/login">普通用户</Link><strong>管理员</strong></div>
          ) : isRegister ? (
            <section className="identity-choice" aria-label="注册身份选择">
              <span className="identity-label">身份选择</span>
              <div className="identity-grid">
                <button type="button" className="identity-option active">
                  <strong>普通用户</strong>
                  <span>开放注册 · 收藏 / 共建 / 导出申请</span>
                </button>
                <Link className="identity-option" to="/admin/login">
                  <strong>管理员身份</strong>
                  <span>预置账号 · 前往管理员登录</span>
                </Link>
              </div>
              <p className="identity-note">管理员账号由系统预置，不开放公开注册；如需管理员权限，请使用已授权账号登录。</p>
            </section>
          ) : (
            <div className="role-tabs"><strong>普通用户登录</strong><Link to="/admin/login">管理员入口</Link></div>
          )}
          {isRegister && <TextField label="姓名 / 昵称" placeholder="请输入姓名" value={nickname} onChange={setNickname} />}
          <TextField label="邮箱" placeholder="请输入邮箱地址" value={email} onChange={setEmail} />
          <TextField label="密码" placeholder="请输入密码" type="password" value={password} onChange={setPassword} />
          {isRegister && <TextField label="确认密码" placeholder="请确认密码" type="password" value={confirm} onChange={setConfirm} />}
          {error && <p className="form-error">{error}</p>}
          <Button type="submit">{isRegister ? '注册' : '登录'}</Button>
          {!isRegister && !isAdmin && (
            <Link className="auth-guest-entry" to="/map">
              <MapPinned size={16} aria-hidden="true" />
              <span>游客登录</span>
              <small>无需账号，浏览公开地图</small>
            </Link>
          )}
          <div className="auth-switch">
            {isRegister
              ? <>已有账号？ <Link to="/login">立即登录</Link></>
              : isAdmin
                ? <>返回普通用户入口？ <Link to="/login">用户登录</Link></>
                : <>还没有账号？ <Link to="/register">立即注册</Link></>}
          </div>
        </form>
      </section>
      <FeedbackDialog open={!!feedback} title={feedback?.title ?? ''} message={feedback?.message ?? ''} tone={feedback?.tone} onClose={() => setFeedback(null)} />
    </main>
  );
}
