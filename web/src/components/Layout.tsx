import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { apiPost } from '../lib/api';
import { useMe, avatarUrl } from '../auth';

const nav = [
  { to: '/', label: 'نظرة عامة', icon: '🏠', end: true },
  { to: '/members', label: 'الأعضاء', icon: '👥', end: false },
  { to: '/cases', label: 'سجل العقوبات', icon: '🛡️', end: false },
  { to: '/settings', label: 'الإعدادات', icon: '⚙️', end: false },
];

const titles: Record<string, string> = {
  '/': 'نظرة عامة',
  '/members': 'إدارة الأعضاء',
  '/cases': 'سجل العقوبات',
  '/settings': 'الإعدادات',
};

export function Layout() {
  const navigate = useNavigate();
  const loc = useLocation();
  const { data: me } = useMe();
  const av = avatarUrl(me);

  async function logout() {
    await apiPost('/auth/logout').catch(() => undefined);
    navigate('/login', { replace: true });
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-dot" />
          <span>LIFEYOI</span>
        </div>
        <nav className="nav">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
            >
              <span className="ico">{n.icon}</span>
              <span className="label">{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="nav-spacer" />
        <div className="side-user">
          {av ? <img className="avatar avatar-sm" src={av} alt="" /> : <div className="avatar avatar-sm" />}
          <div className="meta">
            <div className="name">{me?.username ?? '...'}</div>
            <div className="role">إداري</div>
          </div>
        </div>
        <button className="btn btn-ghost" onClick={logout}>
          تسجيل الخروج
        </button>
      </aside>
      <div className="main">
        <header className="topbar">
          <h1>{titles[loc.pathname] ?? 'لوحة التحكم'}</h1>
        </header>
        <div className="page">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
