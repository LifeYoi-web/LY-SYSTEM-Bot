import { useEffect, useState } from 'react';
import { useTempVoice, useUpdateTempVoice, type TempVoiceConfig } from '../lib/community';
import { Icon } from '../lib/icons';
import { Switch, SkeletonRows, toast } from '../components/ui';
import { Select, useChannelOptions } from '../components/pickers';
import { useEntitlements } from '../lib/hooks';
import { PremiumLock } from '../components/PremiumLock';

export function TempVoice() {
  const { data, isLoading, error } = useTempVoice();
  const save = useUpdateTempVoice();
  const voiceChannels = useChannelOptions(['voice']);
  const categories = useChannelOptions(['category']);
  const [d, setD] = useState<TempVoiceConfig | null>(null);
  const { data: ent } = useEntitlements();
  useEffect(() => { if (data?.config) setD(data.config); }, [data]);
  if ((error as any)?.status === 403) {
    if (ent) return <PremiumLock feature="tempVoice" ent={ent} />;
    return <div className="tr-sub" style={{ padding: 24 }}>ميزة بريميوم — رقِّ سيرفرك لفتحها</div>;
  }
  if (isLoading || !d) return <SkeletonRows rows={6} />;
  const set = <K extends keyof TempVoiceConfig>(k: K, v: TempVoiceConfig[K]) => setD({ ...d, [k]: v });

  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <PremiumLock feature="tempVoice" ent={ent ?? null} />
      <div className="card card-pad" style={{ borderColor: d.enabled ? 'var(--accent-line)' : undefined }}>
        <div className="toggle-row" style={{ padding: 0, border: 'none' }}>
          <div className="row">
            <div className="kpi-ico" style={{ background: 'var(--accent-soft)' }}><Icon name="mic" /></div>
            <div><div className="tr-title" style={{ fontSize: 16 }}>الرومات الصوتية المؤقتة</div><div className="tr-sub">«انضم لتُنشئ» — العضو يدخل روم الـhub فيُنشئ له البوت رومه الخاص وينقله له، ويُحذف لمّا يفضى.</div></div>
          </div>
          <Switch checked={d.enabled} onChange={(v) => set('enabled', v)} />
        </div>
      </div>

      <div className="card card-pad" style={{ opacity: d.enabled ? 1 : 0.55, pointerEvents: d.enabled ? 'auto' : 'none' }}>
        <div className="field"><label>روم الـhub (صوتي)</label><Select value={d.hubChannelId} onChange={(v) => set('hubChannelId', v)} options={voiceChannels} placeholder="اختر روم صوتي" /></div>
        <div className="field"><label>تصنيف الرومات المُنشأة (اختياري)</label><Select value={d.categoryId} onChange={(v) => set('categoryId', v)} options={categories} placeholder="بدون تصنيف" /></div>
        <div className="field"><label>قالب اسم الروم</label><input className="input" value={d.nameTemplate} onChange={(e) => set('nameTemplate', e.target.value)} maxLength={80} placeholder="روم {user}" /><div className="tr-sub" style={{ marginTop: 4 }}>متغيّر متاح: <code>{'{user}'}</code> = اسم العضو الظاهر.</div></div>
        <div className="field"><label>الحد الافتراضي للأعضاء (0 = بدون حد)</label><input className="input" type="number" min={0} max={99} value={d.defaultUserLimit} onChange={(e) => set('defaultUserLimit', Math.max(0, Math.min(99, Number(e.target.value) || 0)))} /></div>
        <div className="toggle-row" style={{ marginTop: 4 }}><div><div className="tr-title">إنشاء الروم مقفولًا افتراضيًا</div><div className="tr-sub">يمنع @everyone من الدخول إلا بعد ما يفتحه المالك.</div></div><Switch checked={d.defaultLocked} onChange={(v) => set('defaultLocked', v)} /></div>
      </div>

      <div className="row">
        <button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate({
          enabled: d.enabled, hubChannelId: d.hubChannelId, categoryId: d.categoryId,
          nameTemplate: d.nameTemplate, defaultUserLimit: d.defaultUserLimit, defaultLocked: d.defaultLocked,
        }, { onSuccess: () => toast('تم الحفظ'), onError: () => toast('فشل', 'err') })}><Icon name="check" /> حفظ</button>
      </div>

      <div className="card card-pad">
        <div className="card-hd"><div className="card-title"><Icon name="sparkles" /> كيف يستخدمها العضو</div></div>
        <ol style={{ paddingInlineStart: 20, lineHeight: 1.9, margin: 0 }}>
          <li>يدخل روم الـhub المحدد فوق.</li>
          <li>البوت ينشئ له روم خاص في التصنيف المحدد وينقله له فورًا.</li>
          <li>يلقى داخل الروم لوحة أزرار: ✏️ إعادة تسمية · 🔒 قفل/فتح · 🙋 استلام · 👥 حدّ الأعضاء · 👢 طرد.</li>
          <li>لمّا يطلع آخر شخص من الروم، البوت يحذفه تلقائيًا.</li>
        </ol>
      </div>
    </div>
  );
}
