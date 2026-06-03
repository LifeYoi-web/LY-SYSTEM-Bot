import { useEffect, useState } from 'react';
import { useDigest, useUpdateDigest, useTestDigest, type DigestConfig } from '../lib/community';
import { Icon } from '../lib/icons';
import { Switch, SkeletonRows, toast } from '../components/ui';
import { Select, useChannelOptions } from '../components/pickers';

const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export function Digest() {
  const { data, isLoading } = useDigest();
  const save = useUpdateDigest();
  const test = useTestDigest();
  const channels = useChannelOptions(['text', 'announcement']);
  const [d, setD] = useState<DigestConfig | null>(null);
  useEffect(() => { if (data && !d) setD(data); }, [data, d]);
  if (isLoading || !d) return <SkeletonRows rows={4} />;
  const set = <K extends keyof DigestConfig>(k: K, v: DigestConfig[K]) => setD({ ...d, [k]: v });
  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <p className="page-intro" style={{ margin: 0 }}>ملخّص أسبوعي تلقائي لأبرز نشاط السيرفر.</p>
      <div className="card card-pad">
        <div className="toggle-row"><div><div className="tr-title">تفعيل الملخّص</div><div className="tr-sub">إرسال ملخّص أسبوعي تلقائيًا</div></div><Switch checked={d.enabled} onChange={(v) => set('enabled', v)} /></div>
        <div className="field" style={{ marginTop: 14 }}><label>القناة</label><Select value={d.channelId} onChange={(v) => set('channelId', v)} options={channels} placeholder="اختر قناة" /></div>
        <div className="field" style={{ marginTop: 14 }}><label>يوم الإرسال</label><select className="select" value={d.weekday} onChange={(e) => set('weekday', Number(e.target.value))}>{WEEKDAYS.map((label, i) => <option key={i} value={i}>{label}</option>)}</select></div>
      </div>
      <div className="row">
        <button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate({ enabled: d.enabled, channelId: d.channelId, weekday: d.weekday }, { onSuccess: () => toast('تم الحفظ'), onError: () => toast('فشل الحفظ', 'err') })}><Icon name="check" /> حفظ</button>
        <button className="btn btn-ghost" disabled={test.isPending} onClick={() => test.mutate(undefined, { onSuccess: () => toast('تم الإرسال'), onError: () => toast('فشل — تأكد من اختيار قناة', 'err') })}><Icon name="megaphone" /> إرسال تجريبي الآن</button>
      </div>
    </div>
  );
}
