import { useEffect, useState } from 'react';
import { useCounting, useUpdateCounting, type CountingConfig } from '../lib/community';
import { Icon } from '../lib/icons';
import { Switch, SkeletonRows, toast, fmt } from '../components/ui';
import { Select, useChannelOptions } from '../components/pickers';

export function Counting() {
  const { data, isLoading } = useCounting();
  const save = useUpdateCounting();
  const channels = useChannelOptions(['text']);
  const [d, setD] = useState<CountingConfig | null>(null);
  // Initialize once so the reset action's refetch doesn't clobber unsaved channel/enable edits.
  useEffect(() => { if (data && !d) setD(data); }, [data, d]);
  if (isLoading || !d) return <SkeletonRows rows={4} />;
  const set = <K extends keyof CountingConfig>(k: K, v: CountingConfig[K]) => setD({ ...d, [k]: v });

  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <p className="page-intro" style={{ margin: 0 }}>لعبة العدّ: الأعضاء يكتبون الأرقام بالتسلسل، ومن يخطئ يكسر السلسلة!</p>
      <div className="kpi-grid">
        <div className="kpi"><div className="kpi-value tnum">{fmt(d.current)}</div><div className="kpi-label">الرقم الحالي</div></div>
        <div className="kpi"><div className="kpi-value tnum" style={{ color: 'var(--accent-text)' }}>{fmt(d.best)}</div><div className="kpi-label">أعلى رقم وصلوا له</div></div>
      </div>
      <div className="card card-pad">
        <div className="toggle-row"><div><div className="tr-title">تفعيل لعبة العدّ</div></div><Switch checked={d.enabled} onChange={(v) => set('enabled', v)} /></div>
        <div className="field" style={{ marginTop: 14 }}><label>قناة العدّ</label><Select value={d.channelId} onChange={(v) => set('channelId', v)} options={channels} placeholder="اختر قناة" /></div>
      </div>
      <div className="row">
        <button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate({ enabled: d.enabled, channelId: d.channelId }, { onSuccess: () => toast('تم الحفظ'), onError: () => toast('فشل الحفظ', 'err') })}><Icon name="check" /> حفظ</button>
        <button className="btn btn-ghost" disabled={save.isPending} onClick={() => save.mutate({ reset: true }, { onSuccess: () => { setD({ ...d, current: 0, lastUserId: null }); toast('تمت إعادة العدّ إلى 0'); } })}><Icon name="rotate-ccw" /> تصفير العدّاد</button>
      </div>
    </div>
  );
}
