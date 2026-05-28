import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { apiPost } from '../lib/api';
import { useMe, avatarUrl } from '../auth';
import { useOverview } from '../lib/hooks';
import { Icon, type IconName } from '../lib/icons';
import { ToastHost } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
  badge?: number;
}

const SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'عام',
    items: [
      { to: '/dashboard', label: 'نظرة عامة', icon: 'grid', end: true },
      { to: '/dashboard/analytics', label: 'الإحصائيات', icon: 'bar-chart' },
    ],
  },
  {
    title: 'الإدارة',
    items: [
      { to: '/dashboard/members', label: 'الأعضاء', icon: 'users' },
      { to: '/dashboard/cases', label: 'العقوبات', icon: 'shield' },
      { to: '/dashboard/automod', label: 'الحماية التلقائية', icon: 'shield-alert' },
      { to: '/dashboard/logs', label: 'السجلّات', icon: 'scroll' },
      { to: '/dashboard/tickets', label: 'التذاكر', icon: 'message' },
      { to: '/dashboard/report', label: 'البلاغات', icon: 'alert-triangle' },
    ],
  },
  {
    title: 'التفاعل',
    items: [
      { to: '/dashboard/leveling', label: 'المستويات', icon: 'crown' },
      { to: '/dashboard/roles', label: 'رتب الأزرار', icon: 'at-sign' },
      { to: '/dashboard/suggestions', label: 'الاقتراحات', icon: 'sparkles' },
      { to: '/dashboard/giveaways', label: 'السحوبات', icon: 'zap' },
      { to: '/dashboard/starboard', label: 'المميّز', icon: 'eye' },
      { to: '/dashboard/counting', label: 'لعبة العدّ', icon: 'activity' },
      { to: '/dashboard/birthdays', label: 'أعياد الميلاد', icon: 'calendar' },
      { to: '/dashboard/tempvoice', label: 'الرومات الصوتية', icon: 'mic' },
    ],
  },
  {
    title: 'المحتوى',
    items: [
      { to: '/dashboard/announce', label: 'الإعلانات', icon: 'megaphone' },
      { to: '/dashboard/autoresponder', label: 'الردود التلقائية', icon: 'message' },
      { to: '/dashboard/tags', label: 'التاجات', icon: 'hash' },
      { to: '/dashboard/sticky', label: 'الرسائل المثبّتة', icon: 'bell' },
      { to: '/dashboard/scheduled', label: 'الرسائل المجدولة', icon: 'clock' },
      { to: '/dashboard/reminders', label: 'التذكيرات', icon: 'clock' },
      { to: '/dashboard/statcounters', label: 'عدّادات الإحصاء', icon: 'gauge' },
    ],
  },
  {
    title: 'الإعداد',
    items: [
      { to: '/dashboard/bot', label: 'البوت', icon: 'bot' },
      { to: '/dashboard/welcome', label: 'الترحيب', icon: 'smile' },
      { to: '/dashboard/commands', label: 'الأوامر', icon: 'terminal' },
      { to: '/dashboard/settings', label: 'الإعدادات', icon: 'settings' },
    ],
  },
];

const TITLES: Record<string, string> = {
  '/dashboard': 'نظرة عامة',
  '/dashboard/analytics': 'الإحصائيات',
  '/dashboard/members': 'إدارة الأعضاء',
  '/dashboard/cases': 'سجل العقوبات',
  '/dashboard/automod': 'الحماية التلقائية',
  '/dashboard/logs': 'سجلّات الأحداث',
  '/dashboard/leveling': 'نظام المستويات',
  '/dashboard/roles': 'رتب الأزرار',
  '/dashboard/autoresponder': 'الردود التلقائية',
  '/dashboard/announce': 'الإعلانات',
  '/dashboard/scheduled': 'الرسائل المجدولة',
  '/dashboard/tickets': 'نظام التذاكر',
  '/dashboard/report': 'البلاغات',
  '/dashboard/suggestions': 'الاقتراحات',
  '/dashboard/giveaways': 'السحوبات',
  '/dashboard/starboard': 'لوحة المميّز',
  '/dashboard/counting': 'لعبة العدّ',
  '/dashboard/birthdays': 'أعياد الميلاد',
  '/dashboard/tempvoice': 'الرومات الصوتية المؤقتة',
  '/dashboard/tags': 'التاجات',
  '/dashboard/sticky': 'الرسائل المثبّتة',
  '/dashboard/reminders': 'التذكيرات',
  '/dashboard/statcounters': 'عدّادات الإحصاء',
  '/dashboard/bot': 'إعدادات البوت',
  '/dashboard/welcome': 'رسائل الترحيب',
  '/dashboard/commands': 'أوامر البوت',
  '/dashboard/settings': 'الإعدادات',
};

export function Layout() {
  const navigate = useNavigate();
  const loc = useLocation();
  const { data: me } = useMe();
  const { data: overview } = useOverview();
  const av = avatarUrl(me);

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('ly_collapsed') === '1');
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    localStorage.setItem('ly_collapsed', collapsed ? '1' : '0');
  }, [collapsed]);
  useEffect(() => {
    setDrawer(false); // close mobile drawer on navigation
  }, [loc.pathname]);

  async function logout() {
    await apiPost('/auth/logout').catch(() => undefined);
    navigate('/login', { replace: true });
  }

  const activeCases = overview?.activeCases ?? 0;

  return (
    <div className={`app ${collapsed ? 'collapsed' : ''} ${drawer ? 'drawer-open' : ''}`}>
      {drawer && <div className="sidebar-backdrop" onClick={() => setDrawer(false)} />}
      <aside className="sidebar">
        <button className="collapse-btn" onClick={() => setCollapsed((c) => !c)} aria-label="طي الشريط الجانبي">
          <Icon name="chevrons-right" />
        </button>
        <div className="brand">
          <img src="/logo.png" alt="LY-SYSTEM" />
          <div className="bt">
            <b>LY-SYSTEM</b>
            <span>CONTROL</span>
          </div>
        </div>
        <nav className="nav">
          {SECTIONS.map((sec) => (
            <div key={sec.title}>
              <div className="nav-sec">{sec.title}</div>
              {sec.items.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
                  title={n.label}
                >
                  <Icon name={n.icon} />
                  <span className="label">{n.label}</span>
                  {n.to === '/dashboard/cases' && activeCases > 0 && (
                    <span className="badge-count">{activeCases}</span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="nav-spacer" />
        <div className="side-user">
          {av ? <img className="avatar avatar-sm" src={av} alt="" /> : <div className="avatar avatar-sm" />}
          <div className="meta">
            <div className="name">{me?.username ?? '...'}</div>
            <div className="role">طاقم الإدارة</div>
          </div>
        </div>
        <button className="btn btn-subtle btn-block" onClick={logout}>
          <Icon name="log-out" />
          <span className="label">تسجيل الخروج</span>
        </button>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-toggle" onClick={() => setDrawer(true)} aria-label="القائمة">
            <Icon name="menu" />
          </button>
          <div className="crumb">
            <span className="pre">{overview?.name ?? 'LY-SYSTEM'}</span>
            <h1>{TITLES[loc.pathname] ?? 'لوحة التحكم'}</h1>
          </div>
          <div className="spacer" />
          <a className="icon-btn" href="/" title="الموقع العام" target="_blank" rel="noreferrer">
            <Icon name="external-link" />
          </a>
        </header>
        <div className="page">
          <Outlet />
        </div>
      </div>
      <ToastHost />
    </div>
  );
}
