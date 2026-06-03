import { useEffect, useState } from 'react';
import { useAlerts, useUpdateAlerts, type AlertConfig } from '../lib/community';
import { Icon } from '../lib/icons';
import { Switch, SkeletonRows, toast, clampInt } from '../components/ui';
import { Select, useChannelOptions } from '../components/pickers';

export function Alerts() {
  const { data, isLoading } = useAlerts();
  const save = useUpdateAlerts();
  const channels = useChannelOptions(['text']);
  const [d, setD] = useState<AlertConfig | null>(null);
  useEffect(() => { if (data && !d) setD(data); }, [data, d]);
  if (isLoading || !d) return <SkeletonRows rows={5} />;
  const set = <K extends keyof AlertConfig>(k: K, v: AlertConfig[K]) => setD({ ...d, [k]: v });
  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <p className="page-intro" style={{ margin: 0 }}>تنبيهات تراقب اتجاهات السيرفر (مغادرات/نشاط/انضمام) وتنبّه الإدارة.</p>
      <div className="card card-pad">
        <div className="toggle-row"><div><div className="tr-title">تفعيل التنبيهات</div><div className="tr-sub">مراقبة اتجاهات السيرفر وإرسال تنبيهات للإدارة</div></div><Switch checked={d.enabled} onChange={(v) => set('enabled', v)} /></div>
        <div className="field" style={{ marginTop: 14 }}><label>قناة التنبيه</label><Select value={d.alertChannelId ?? ''} onChange={(v) => set('alertChannelId', v || null)} options={channels} placeholder="قناة التنبيه (افتراضي: السجلّات)" /></div>
      </div>
      <div className="card card-pad">
        <div className="card-hd"><div className="card-title">قواعد التنبيه</div></div>
        <div className="toggle-row"><div><div className="tr-title">قفزة مغادرات: تنبيه عند مغادرة N عضو في اليوم</div></div><Switch checked={d.leaveSpikeEnabled} onChange={(v) => set('leaveSpikeEnabled', v)} /></div>
        {d.leaveSpikeEnabled && <div className="field" style={{ marginTop: 14 }}><label>عدد المغادرات (N)</label><input className="input tnum" type="number" value={d.leaveSpikeThreshold} onChange={(e) => set('leaveSpikeThreshold', clampInt(e.target.value, 1, 100000))} /></div>}
        <div className="toggle-row" style={{ marginTop: 14 }}><div><div className="tr-title">موجة انضمام: تنبيه عند انضمام N عضو في اليوم</div></div><Switch checked={d.joinSpikeEnabled} onChange={(v) => set('joinSpikeEnabled', v)} /></div>
        {d.joinSpikeEnabled && <div className="field" style={{ marginTop: 14 }}><label>عدد الانضمامات (N)</label><input className="input tnum" type="number" value={d.joinSpikeThreshold} onChange={(e) => set('joinSpikeThreshold', clampInt(e.target.value, 1, 100000))} /></div>}
        <div className="toggle-row" style={{ marginTop: 14 }}><div><div className="tr-title">هبوط نشاط: تنبيه عند انخفاض الرسائل N% عن متوسط 7 أيام</div></div><Switch checked={d.activityDropEnabled} onChange={(v) => set('activityDropEnabled', v)} /></div>
        {d.activityDropEnabled && <div className="field" style={{ marginTop: 14 }}><label>نسبة الهبوط (N%)</label><input className="input tnum" type="number" value={d.activityDropPct} onChange={(e) => set('activityDropPct', clampInt(e.target.value, 1, 100))} /></div>}
      </div>
      <div className="row"><button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate({ enabled: d.enabled, alertChannelId: d.alertChannelId, leaveSpikeEnabled: d.leaveSpikeEnabled, leaveSpikeThreshold: d.leaveSpikeThreshold, joinSpikeEnabled: d.joinSpikeEnabled, joinSpikeThreshold: d.joinSpikeThreshold, activityDropEnabled: d.activityDropEnabled, activityDropPct: d.activityDropPct }, { onSuccess: () => toast('تم الحفظ'), onError: () => toast('فشل الحفظ', 'err') })}><Icon name="check" /> حفظ</button></div>
    </div>
  );
}
