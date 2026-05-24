import { Icon, type IconName } from '../lib/icons';

interface Cmd {
  name: string;
  desc: string;
  icon: IconName;
}
const GROUPS: { title: string; icon: IconName; items: Cmd[] }[] = [
  {
    title: 'عام',
    icon: 'grid',
    items: [
      { name: '/help', desc: 'عرض قائمة كل الأوامر', icon: 'scroll' },
      { name: '/ping', desc: 'قياس سرعة استجابة البوت', icon: 'activity' },
      { name: '/dashboard', desc: 'رابط لوحة التحكم', icon: 'external-link' },
    ],
  },
  {
    title: 'الإشراف',
    icon: 'shield',
    items: [
      { name: '/ban', desc: 'حظر عضو من السيرفر', icon: 'ban' },
      { name: '/kick', desc: 'طرد عضو', icon: 'user-x' },
      { name: '/timeout', desc: 'كتم عضو لمدة محددة', icon: 'volume-x' },
      { name: '/warn', desc: 'توجيه تحذير وتسجيله', icon: 'alert-triangle' },
      { name: '/unban', desc: 'فك الحظر عبر المعرّف', icon: 'check-circle' },
      { name: '/clear', desc: 'حذف عدد من الرسائل', icon: 'trash' },
      { name: '/slowmode', desc: 'ضبط الوضع البطيء للقناة', icon: 'clock' },
    ],
  },
  {
    title: 'أدوات',
    icon: 'terminal',
    items: [
      { name: '/userinfo', desc: 'معلومات عضو', icon: 'users' },
      { name: '/serverinfo', desc: 'معلومات السيرفر', icon: 'globe' },
      { name: '/avatar', desc: 'عرض صورة عضو', icon: 'eye' },
      { name: '/poll', desc: 'إنشاء تصويت سريع', icon: 'bar-chart' },
      { name: '/say', desc: 'إعلان باسم البوت', icon: 'megaphone' },
    ],
  },
];

export function Commands() {
  const total = GROUPS.reduce((a, g) => a + g.items.length, 0);
  return (
    <div className="stack">
      <p className="page-intro">
        {total} أمر متاح — تُسجَّل كأوامر Slash تلقائيًا في سيرفرك. أوامر الإشراف محميّة بصلاحيات Discord.
      </p>
      {GROUPS.map((g) => (
        <div className="card card-pad" key={g.title}>
          <div className="card-hd">
            <div className="card-title">
              <Icon name={g.icon} /> {g.title}
              <span className="badge badge-warn" style={{ marginInlineStart: 4 }}>{g.items.length}</span>
            </div>
          </div>
          <div className="grid grid-3">
            {g.items.map((c) => (
              <div className="cmd" key={c.name} style={{ borderRadius: 12, padding: '13px 15px' }}>
                <Icon name={c.icon} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{c.name}</div>
                  <div className="fs faint" style={{ fontFamily: 'var(--font)' }}>
                    {c.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
