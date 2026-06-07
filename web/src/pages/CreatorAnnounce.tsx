import { useEffect, useState } from 'react';
import {
  useCreatorAnnounce,
  useUpdateCreatorAnnounce,
  useTestCreatorAnnounce,
  type CreatorAnnounceConfig,
} from '../lib/community';
import { Icon } from '../lib/icons';
import { Switch, SkeletonRows, toast } from '../components/ui';
import { Select, useChannelOptions, useRoleOptions } from '../components/pickers';
import { useEntitlements } from '../lib/hooks';
import { PremiumLock } from '../components/PremiumLock';

const PING_OPTIONS = [
  { id: 'everyone', label: '@everyone — كل الأعضاء' },
  { id: 'here', label: '@here — المتصلين حاليًا' },
  { id: 'role', label: 'رتبة محددة' },
  { id: 'none', label: 'بدون منشن' },
];

export function CreatorAnnounce() {
  const { data, isLoading } = useCreatorAnnounce();
  const save = useUpdateCreatorAnnounce();
  const test = useTestCreatorAnnounce();
  const channels = useChannelOptions(['text']);
  const roles = useRoleOptions();
  const [d, setD] = useState<CreatorAnnounceConfig | null>(null);
  const { data: ent } = useEntitlements();
  useEffect(() => { if (data?.config) setD(data.config); }, [data]);
  if (isLoading || !d) return <SkeletonRows rows={7} />;
  const set = <K extends keyof CreatorAnnounceConfig>(k: K, v: CreatorAnnounceConfig[K]) => setD({ ...d, [k]: v });

  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <PremiumLock feature="creatorAlerts" ent={ent ?? null} />
      <p className="page-intro" style={{ margin: 0 }}>
        لمّا ينزل مقطع جديد على قناتك، البوت ينشر إشعارًا منسّقًا في القناة المحددة ويعمل ping للأعضاء.
        يوتيوب يشتغل مجانًا بدون أي مفتاح. تيك توك يحتاج مفتاح <code>RAPIDAPI_KEY</code> في إعدادات الاستضافة.
      </p>

      <div className="card card-pad" style={{ borderColor: d.enabled ? 'var(--accent-line)' : undefined }}>
        <div className="toggle-row" style={{ padding: 0, border: 'none' }}>
          <div className="row">
            <div className="kpi-ico" style={{ background: 'var(--accent-soft)' }}><Icon name="video" /></div>
            <div><div className="tr-title" style={{ fontSize: 16 }}>إشعارات المقاطع الجديدة</div><div className="tr-sub">يراقب يوتيوب/تيك توك وينبّه عند نزول مقطع جديد.</div></div>
          </div>
          <Switch checked={d.enabled} onChange={(v) => set('enabled', v)} />
        </div>
      </div>

      <div className="card card-pad" style={{ opacity: d.enabled ? 1 : 0.55, pointerEvents: d.enabled ? 'auto' : 'none' }}>
        <div className="card-hd"><div className="card-title"><Icon name="megaphone" /> الإشعار</div></div>
        <div className="field"><label>قناة الإشعارات</label><Select value={d.channelId} onChange={(v) => set('channelId', v)} options={channels} placeholder="اختر قناة" /></div>
        <div className="field">
          <label>المنشن</label>
          <select className="select" value={d.pingMode} onChange={(e) => set('pingMode', e.target.value)}>
            {PING_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
        {d.pingMode === 'role' && (
          <div className="field"><label>الرتبة المطلوب منشنها</label><Select value={d.pingRoleId} onChange={(v) => set('pingRoleId', v)} options={roles} placeholder="اختر رتبة" /></div>
        )}
        <div className="field" style={{ marginBottom: 0 }}>
          <label>قالب نص الإشعار (اختياري)</label>
          <input className="input" value={d.messageTemplate ?? ''} onChange={(e) => set('messageTemplate', e.target.value || null)} maxLength={300} placeholder="🎬 نزل فيديو جديد! لا يفوتكم 🔥" />
          <div className="tr-sub" style={{ marginTop: 4 }}>متغيّرات: <code>{'{title}'}</code> <code>{'{url}'}</code> <code>{'{platform}'}</code> <code>{'{creator}'}</code></div>
        </div>
      </div>

      <div className="card card-pad" style={{ opacity: d.enabled ? 1 : 0.55, pointerEvents: d.enabled ? 'auto' : 'none' }}>
        <div className="toggle-row" style={{ padding: 0, border: 'none', marginBottom: 12 }}>
          <div><div className="tr-title">يوتيوب</div><div className="tr-sub">مجاني عبر RSS — بدون مفتاح API.</div></div>
          <Switch checked={d.youtubeEnabled} onChange={(v) => set('youtubeEnabled', v)} />
        </div>
        <div className="field" style={{ marginBottom: 0, opacity: d.youtubeEnabled ? 1 : 0.55 }}>
          <label>قناة يوتيوب</label>
          <input className="input" value={d.youtubeChannelId ?? ''} onChange={(e) => set('youtubeChannelId', e.target.value || null)} placeholder="رابط القناة أو @المعرّف أو UC..." />
          <div className="tr-sub" style={{ marginTop: 4 }}>الصق رابط قناتك أو معرّفها؛ يُحفظ كمعرّف القناة تلقائيًا.</div>
        </div>
      </div>

      <div className="card card-pad" style={{ opacity: d.enabled ? 1 : 0.55, pointerEvents: d.enabled ? 'auto' : 'none' }}>
        <div className="toggle-row" style={{ padding: 0, border: 'none', marginBottom: 12 }}>
          <div><div className="tr-title">تيك توك</div><div className="tr-sub">يحتاج مفتاح <code>RAPIDAPI_KEY</code> في الاستضافة. best-effort وقد يتأثر بمزوّد الخدمة.</div></div>
          <Switch checked={d.tiktokEnabled} onChange={(v) => set('tiktokEnabled', v)} />
        </div>
        <div className="field" style={{ marginBottom: 0, opacity: d.tiktokEnabled ? 1 : 0.55 }}>
          <label>يوزر تيك توك</label>
          <input className="input" value={d.tiktokUsername ?? ''} onChange={(e) => set('tiktokUsername', e.target.value || null)} placeholder="username (بدون @)" />
        </div>
      </div>

      <div className="row" style={{ gap: 10 }}>
        <button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate({
          enabled: d.enabled, channelId: d.channelId, pingMode: d.pingMode, pingRoleId: d.pingRoleId,
          messageTemplate: d.messageTemplate, youtubeEnabled: d.youtubeEnabled, youtubeChannelId: d.youtubeChannelId,
          tiktokEnabled: d.tiktokEnabled, tiktokUsername: d.tiktokUsername,
        }, { onSuccess: () => toast('تم الحفظ'), onError: () => toast('فشل الحفظ — تأكد من قناة يوتيوب', 'err') })}><Icon name="check" /> حفظ</button>
        <button className="btn btn-subtle" disabled={test.isPending} onClick={() => test.mutate(undefined, {
          onSuccess: (r: any) => toast(r?.ok ? 'أرسلنا إشعارًا تجريبيًا' : 'تعذّر الإرسال — تحقق من القناة', r?.ok ? 'ok' : 'err'),
          onError: () => toast('تعذّر الإرسال', 'err'),
        })}><Icon name="megaphone" /> إرسال إشعار تجريبي</button>
      </div>
    </div>
  );
}
