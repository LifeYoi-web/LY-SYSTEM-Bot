import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface OverviewData {
  name: string;
  memberCount: number;
  channelCount: number;
}
interface ModCase {
  id: string;
  targetUserId: string;
  type: string;
  reason: string | null;
  createdAt: string;
  active: boolean;
}
const typeLabels: Record<string, string> = { ban: 'حظر', kick: 'طرد', mute: 'كتم', warn: 'تحذير' };

function Stat({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <div className="stat-card">
      <div className="stat-ico">{icon}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export function Overview() {
  const overview = useQuery<OverviewData>({ queryKey: ['overview'], queryFn: () => api('/overview') });
  const cases = useQuery<ModCase[]>({ queryKey: ['cases', ''], queryFn: () => api('/moderation/cases') });

  if (overview.isLoading) return <div className="center-screen" style={{ minHeight: 300 }}><div className="spinner" /></div>;
  if (overview.error) return <p className="err-text">تعذّر تحميل البيانات</p>;

  const d = overview.data!;
  const activeCount = cases.data?.filter((c) => c.active).length ?? 0;
  const recent = (cases.data ?? []).slice(0, 6);

  return (
    <>
      <p className="page-intro">أهلًا فيك في لوحة تحكم {d.name} 👋</p>
      <div className="stat-grid">
        <Stat icon="🏷️" value={d.name} label="اسم السيرفر" />
        <Stat icon="👥" value={d.memberCount.toLocaleString('ar')} label="عدد الأعضاء" />
        <Stat icon="💬" value={d.channelCount.toLocaleString('ar')} label="عدد القنوات" />
        <Stat icon="🛡️" value={activeCount.toLocaleString('ar')} label="عقوبات فعّالة" />
      </div>

      <div className="card card-pad">
        <h2 className="card-title">🛡️ آخر العقوبات</h2>
        {recent.length === 0 ? (
          <div className="empty">ما فيه عقوبات بعد — السيرفر نظيف ✨</div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>النوع</th><th>العضو</th><th>السبب</th><th>التاريخ</th></tr>
              </thead>
              <tbody>
                {recent.map((c) => (
                  <tr key={c.id}>
                    <td><span className={`badge badge-${c.type}`}>{typeLabels[c.type] ?? c.type}</span></td>
                    <td className="mono">{c.targetUserId}</td>
                    <td>{c.reason ?? '—'}</td>
                    <td className="muted">{new Date(c.createdAt).toLocaleDateString('ar')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
