import { useEffect, useState } from 'react';
import { useRaid, useUpdateRaid, type RaidConfig } from '../lib/community';
import { Icon } from '../lib/icons';
import { Switch, SkeletonRows, toast, clampInt } from '../components/ui';
import { Select, useChannelOptions } from '../components/pickers';

const ACTIONS = [
  { id: 'lockdown', label: 'قفل فقط' },
  { id: 'kick', label: 'قفل + طرد' },
  { id: 'ban', label: 'قفل + حظر' },
];

export function Raid() {
  const { data, isLoading } = useRaid();
  const save = useUpdateRaid();
  const channels = useChannelOptions(['text']);
  const [d, setD] = useState<RaidConfig | null>(null);
  useEffect(() => { if (data && !d) setD(data); }, [data, d]);
  if (isLoading || !d) return <SkeletonRows rows={6} />;
  const set = <K extends keyof RaidConfig>(k: K, v: RaidConfig[K]) => setD({ ...d, [k]: v });

  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <p className="page-intro" style={{ margin: 0 }}>يراقب موجات الانضمام ويقفل السيرفر تلقائيًا عند رصد ريد. الأمر /raidmode يتيح التحكم اليدوي.</p>
      <div className="card card-pad">
        <div className="toggle-row"><div><div className="tr-title">تفعيل الحماية من الريد</div></div><Switch checked={d.enabled} onChange={(v) => set('enabled', v)} /></div>
        <div className="field" style={{ marginTop: 14 }}><label>نافذة الرصد (ثوانٍ)</label><input className="input tnum" type="number" value={d.joinWindowSec} onChange={(e) => set('joinWindowSec', clampInt(e.target.value, 1, 600))} /></div>
        <div className="field" style={{ marginTop: 14 }}><label>عدد المنضمين خلال النافذة الذي يفعّل القفل</label><input className="input tnum" type="number" value={d.joinThreshold} onChange={(e) => set('joinThreshold', clampInt(e.target.value, 2, 1000))} /></div>
        <div className="field" style={{ marginTop: 14 }}><label>الإجراء عند رصد ريد</label><Select value={d.action} onChange={(v) => set('action', v || 'lockdown')} options={ACTIONS} placeholder="قفل فقط" /></div>
      </div>
      <div className="card card-pad">
        <div className="toggle-row"><div><div className="tr-title">رفع مستوى التحقق لأعلى درجة أثناء القفل</div></div><Switch checked={d.raiseVerification} onChange={(v) => set('raiseVerification', v)} /></div>
        <div className="field" style={{ marginTop: 14 }}><label>رفع القفل تلقائيًا بعد (دقائق، 0=يدوي)</label><input className="input tnum" type="number" value={d.autoLiftMinutes} onChange={(e) => set('autoLiftMinutes', clampInt(e.target.value, 0, 1440))} /></div>
        <div className="field" style={{ marginTop: 14 }}><label>قناة التنبيه (افتراضي: قناة السجلّات)</label><Select value={d.alertChannelId ?? ''} onChange={(v) => set('alertChannelId', v || null)} options={channels} placeholder="اختر قناة" /></div>
      </div>
      <div className="row">
        <button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate({ enabled: d.enabled, joinWindowSec: d.joinWindowSec, joinThreshold: d.joinThreshold, action: d.action, raiseVerification: d.raiseVerification, autoLiftMinutes: d.autoLiftMinutes, alertChannelId: d.alertChannelId }, { onSuccess: () => toast('تم الحفظ'), onError: () => toast('فشل الحفظ', 'err') })}><Icon name="check" /> حفظ</button>
      </div>
    </div>
  );
}
