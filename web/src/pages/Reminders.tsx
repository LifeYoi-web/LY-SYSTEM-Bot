import { useReminders, useDeleteReminder } from '../lib/community';
import { Icon } from '../lib/icons';
import { SkeletonRows, EmptyState, relTime } from '../components/ui';

export function Reminders() {
  const { data, isLoading } = useReminders();
  const del = useDeleteReminder();

  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <p className="page-intro" style={{ margin: 0 }}>التذكيرات التي أنشأها الأعضاء عبر <code>/remind</code>. تُرسل تلقائيًا في وقتها.</p>
      {isLoading ? (
        <SkeletonRows rows={4} />
      ) : !data || data.items.length === 0 ? (
        <div className="card"><EmptyState icon="clock" title="لا تذكيرات قادمة" /></div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>العضو</th><th>المحتوى</th><th>الموعد</th><th></th></tr></thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.userId}</td>
                    <td style={{ maxWidth: 360, color: 'var(--muted)' }}>{r.content}</td>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>{relTime(r.remindAt)}</td>
                    <td><button className="icon-btn" onClick={() => del.mutate(r.id)} aria-label="حذف"><Icon name="trash" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
