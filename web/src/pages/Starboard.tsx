import { useEffect, useState } from 'react';
import { useStarboard, useUpdateStarboard, type StarboardConfig } from '../lib/community';
import { Icon } from '../lib/icons';
import { Switch, SkeletonRows, toast, clampInt } from '../components/ui';
import { Select, useChannelOptions } from '../components/pickers';

export function Starboard() {
  const { data, isLoading } = useStarboard();
  const save = useUpdateStarboard();
  const channels = useChannelOptions(['text', 'announcement']);
  const [d, setD] = useState<StarboardConfig | null>(null);
  useEffect(() => { if (data) setD(data); }, [data]);
  if (isLoading || !d) return <SkeletonRows rows={4} />;
  const set = <K extends keyof StarboardConfig>(k: K, v: StarboardConfig[K]) => setD({ ...d, [k]: v });

  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <p className="page-intro" style={{ margin: 0 }}>الرسائل التي تتجاوز عدد التفاعلات المحدد تُنشر في قناة المميّز ⭐.</p>
      <div className="card card-pad" style={{ borderColor: d.enabled ? 'var(--accent-line)' : undefined }}>
        <div className="toggle-row" style={{ padding: 0, border: 'none' }}>
          <div className="row">
            <div className="kpi-ico" style={{ background: 'var(--accent-soft)' }}><Icon name="sparkles" /></div>
            <div><div className="tr-title" style={{ fontSize: 16 }}>لوحة المميّز (Starboard)</div><div className="tr-sub">إبراز أفضل الرسائل تلقائيًا.</div></div>
          </div>
          <Switch checked={d.enabled} onChange={(v) => set('enabled', v)} />
        </div>
      </div>
      <div className="card card-pad" style={{ opacity: d.enabled ? 1 : 0.55, pointerEvents: d.enabled ? 'auto' : 'none' }}>
        <div className="field"><label>قناة المميّز</label><Select value={d.channelId} onChange={(v) => set('channelId', v)} options={channels} placeholder="اختر قناة" /></div>
        <div className="field-row">
          <div className="field"><label>الحد الأدنى للتفاعلات</label><input className="input tnum" type="number" min={1} max={50} value={d.threshold} onChange={(e) => set('threshold', clampInt(e.target.value, 1, 50))} /></div>
          <div className="field"><label>الإيموجي</label><input className="input" value={d.emoji} onChange={(e) => set('emoji', e.target.value.slice(0, 8))} placeholder="⭐" /></div>
        </div>
      </div>
      <div className="row"><button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate({ enabled: d.enabled, channelId: d.channelId, threshold: d.threshold, emoji: d.emoji }, { onSuccess: () => toast('تم الحفظ'), onError: () => toast('فشل الحفظ', 'err') })}><Icon name="check" /> حفظ</button></div>
    </div>
  );
}
