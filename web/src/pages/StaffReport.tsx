import { useState } from 'react';
import { useStaffReport, type StaffRow } from '../lib/community';
import { Icon } from '../lib/icons';
import { SkeletonRows, EmptyState } from '../components/ui';

const RANGES: { v: number; label: string }[] = [
  { v: 7, label: '٧ أيام' },
  { v: 30, label: '٣٠ يوم' },
  { v: 90, label: '٩٠ يوم' },
];

export function StaffReport() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useStaffReport(days);
  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <p className="page-intro" style={{ margin: 0 }}>نشاط فريق الإدارة: إجراءات الإشراف والتذاكر، مع تمييز المشرفين الخاملين.</p>
      <div className="seg">
        {RANGES.map((r) => (
          <button key={r.v} className={days === r.v ? 'on' : ''} onClick={() => setDays(r.v)}>
            {r.label}
          </button>
        ))}
      </div>
      {isLoading ? (
        <SkeletonRows rows={5} />
      ) : !data || data.rows.length === 0 ? (
        <EmptyState icon="users" title="لا بيانات" />
      ) : (
        <div className="card">
          <div className="feed">
            {data.rows.map((row: StaffRow) => (
              <div className="feed-item" key={row.userId}>
                <div className="feed-ico"><Icon name="users" /></div>
                <div className="feed-body">
                  <div className={row.tag ? 'ft' : 'ft mono'}>{row.tag ?? row.userId}</div>
                  <div className="fs">إشراف {row.modActions} · استلام {row.ticketsClaimed} · إغلاق {row.ticketsClosed}</div>
                </div>
                {row.inactive && <span className="chip">خامل</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
