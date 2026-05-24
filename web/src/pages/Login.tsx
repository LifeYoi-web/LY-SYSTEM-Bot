import { Link, Navigate } from 'react-router-dom';
import { Icon } from '../lib/icons';
import { useMe } from '../auth';

const MESSAGES: Record<string, string> = {
  notmember: 'لست عضوًا في السيرفر.',
  forbidden: 'ما عندك صلاحية الدخول (الإدارة فقط).',
  oauth: 'تعذّر تسجيل الدخول، حاول مرة ثانية.',
  nocode: 'تعذّر تسجيل الدخول، حاول مرة ثانية.',
  badstate: 'انتهت صلاحية الجلسة، حاول مرة ثانية.',
};

export function Login() {
  const { data } = useMe();
  const error = new URLSearchParams(window.location.search).get('error');
  // Already signed in (e.g. revisiting /login) → go straight to the dashboard.
  if (data?.authorized) return <Navigate to="/dashboard" replace />;
  return (
    <div className="login-wrap site">
      <div className="site-bg" />
      <div className="login-card">
        <div className="logo-badge">
          <img src="/logo.png" alt="LY-SYSTEM" />
        </div>
        <h1>
          LY-<span className="gradient-text">SYSTEM</span>
        </h1>
        <p className="sub">لوحة تحكم سيرفر ديسكورد</p>
        <a className="btn btn-primary btn-lg btn-block" href="/api/auth/login">
          <Icon name="discord" /> تسجيل الدخول عبر Discord
        </a>
        {error && <div className="login-err">{MESSAGES[error] ?? 'حدث خطأ، حاول مرة ثانية.'}</div>}
        <Link className="login-back" to="/">
          <Icon name="chevron-right" size={15} /> العودة للموقع
        </Link>
      </div>
    </div>
  );
}
