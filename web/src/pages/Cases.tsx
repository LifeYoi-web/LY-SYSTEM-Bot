import { useMemo, useState } from 'react';
import { useCases, useLiftCase } from '../lib/hooks';
import { Icon } from '../lib/icons';
import { EmptyState, SkeletonRows, relTime, fmt, toast, CopyButton } from '../components/ui';

const TYPES = [
  { k: 'all', label: 'الكل' },
  { k: 'ban', label: 'حظر' },
  { k: 'kick', label: 'طرد' },
  { k: 'mute', label: 'كتم' },
  { k: 'warn', label: 'تحذير' },
];
const TYPE_LABEL: Record<string, string> = { ban: 'حظر', kick: 'طرد', mute: 'كتم', warn: 'تحذير' };

export function Cases() {
  const [userId, setUserId] = useState('');
  const [type, setType] = useState('all');
  const [activeOnly, setActiveOnly] = useState(false);
  const { data, isLoading } = useCases({ userId: userId.trim() || undefined });
  const lift = useLiftCase();

  const filtered = useMemo(() => {
    let list = data ?? [];
    if (type !== 'all') list = list.filter((c) => c.type === type);
    if (activeOnly) list = list.filter((c) => c.active);
    return list;
  }, [data, type, activeOnly]);

  const activeCount = (data ?? []).filter((c) => c.active).length;

  function doLift(id: string) {
    lift.mutate(id, {
      onSuccess: () => toast('تم رفع العقوبة'),
      onError: () => toast('تعذّر رفع العقوبة', 'err'),
    });
  }

  return (
    <div className="stack">
      <div className="between wrap">
        <div className="search-wrap" style={{ flex: 1, minWidth: 220 }}>
          <Icon name="search" />
          <input className="input" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="فلترة بمعرّف العضو..." />
        </div>
        <div className="row wrap">
          <div className="seg">
            {TYPES.map((t) => (
              <button key={t.k} className={type === t.k ? 'on' : ''} onClick={() => setType(t.k)}>
                {t.label}
              </button>
            ))}
          </div>
          <button className={`btn btn-sm ${activeOnly ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setActiveOnly((v) => !v)}>
            <Icon name="shield" /> الفعّالة فقط
          </button>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-value tnum">{fmt(data?.length ?? 0)}</div>
          <div className="kpi-label">إجمالي العقوبات المسجّلة</div>
        </div>
        <div className="kpi">
          <div className="kpi-value tnum" style={{ color: 'var(--success-text)' }}>
            {fmt(activeCount)}
          </div>
          <div className="kpi-label">عقوبات فعّالة الآن</div>
        </div>
      </div>

      <div className="card">
        {isLoading ? (
          <SkeletonRows rows={8} />
        ) : filtered.length === 0 ? (
          <EmptyState icon="shield-check" title="لا عقوبات مطابقة" sub="السيرفر نظيف أو لا توجد نتائج للفلتر الحالي." />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>النوع</th>
                  <th>العضو</th>
                  <th>السبب</th>
                  <th>المشرف</th>
                  <th>التاريخ</th>
                  <th>الحالة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <span className={`badge badge-${c.type}`}>{TYPE_LABEL[c.type] ?? c.type}</span>
                    </td>
                    <td>
                      <span className="mono">{c.targetUserId}</span>
                      <CopyButton value={c.targetUserId} />
                    </td>
                    <td style={{ maxWidth: 280 }}>{c.reason ?? '—'}</td>
                    <td className="mono">{c.moderatorId}</td>
                    <td className="muted" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{relTime(c.createdAt)}</td>
                    <td>
                      <span className={`badge ${c.active ? 'badge-active' : 'badge-lifted'}`}>{c.active ? 'فعّالة' : 'مرفوعة'}</span>
                    </td>
                    <td>
                      {c.active && (c.type === 'ban' || c.type === 'mute') && (
                        <button className="btn btn-ghost btn-sm" disabled={lift.isPending} onClick={() => doLift(c.id)}>
                          <Icon name="rotate-ccw" /> رفع
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
