import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiPut, apiPost } from '../lib/api';
import { Icon } from '../lib/icons';
import { Switch, SkeletonRows, toast } from '../components/ui';
import { Select, useChannelOptions, useRoleOptions } from '../components/pickers';

interface RulesConfig {
  rulesEnabled: boolean;
  rulesChannelId: string | null;
  rulesMessage: string | null;
  rulesRoleId: string | null;
  rulesButtonLabel: string | null;
}

export function Rules() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<RulesConfig>({ queryKey: ['rules'], queryFn: () => api('/rules') });
  const save = useMutation({
    mutationFn: (b: Partial<RulesConfig>) => apiPut('/rules', b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rules'] }),
  });
  const post = useMutation({ mutationFn: (channelId: string) => apiPost('/rules/post', { channelId }) });
  const channels = useChannelOptions(['text', 'announcement']);
  const roles = useRoleOptions();
  const [d, setD] = useState<RulesConfig | null>(null);
  const [postChannel, setPostChannel] = useState<string | null>(null);
  useEffect(() => { if (data) setD(data); }, [data]);
  if (isLoading || !d) return <SkeletonRows rows={5} />;
  const set = <K extends keyof RulesConfig>(k: K, v: RulesConfig[K]) => setD({ ...d, [k]: v });

  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <div className="card card-pad" style={{ borderColor: d.rulesEnabled ? 'var(--accent-line)' : undefined }}>
        <div className="toggle-row" style={{ padding: 0, border: 'none' }}>
          <div className="row">
            <div className="kpi-ico" style={{ background: 'var(--accent-soft)' }}><Icon name="shield-check" /></div>
            <div><div className="tr-title" style={{ fontSize: 16 }}>قبول القوانين</div><div className="tr-sub">العضو يضغط زر «أوافق» فيُمنح رتبة القبول ويفتح له السيرفر.</div></div>
          </div>
          <Switch checked={d.rulesEnabled} onChange={(v) => set('rulesEnabled', v)} />
        </div>
      </div>

      <div className="card card-pad" style={{ opacity: d.rulesEnabled ? 1 : 0.55, pointerEvents: d.rulesEnabled ? 'auto' : 'none' }}>
        <div className="field"><label>قناة عرض القوانين</label><Select value={d.rulesChannelId} onChange={(v) => set('rulesChannelId', v)} options={channels} placeholder="اختر قناة" /></div>
        <div className="field"><label>رتبة القبول</label><Select value={d.rulesRoleId} onChange={(v) => set('rulesRoleId', v)} options={roles} placeholder="اختر رتبة" /></div>
        <div className="field"><label>نص الزر</label><input className="input" value={d.rulesButtonLabel ?? ''} onChange={(e) => set('rulesButtonLabel', e.target.value || null)} maxLength={80} placeholder="أوافق على القوانين" /></div>
        <div className="field" style={{ marginBottom: 0 }}><label>نص القوانين (يدعم Markdown)</label><textarea className="textarea" style={{ minHeight: 200 }} value={d.rulesMessage ?? ''} onChange={(e) => set('rulesMessage', e.target.value)} maxLength={2000} placeholder="١. احترم الأعضاء.&#10;٢. ممنوع الإعلانات.&#10;٣. اتبع تعليمات الطاقم." /></div>
      </div>

      <div className="row">
        <button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate(d, { onSuccess: () => toast('تم الحفظ'), onError: () => toast('فشل', 'err') })}><Icon name="check" /> حفظ</button>
      </div>

      <div className="card card-pad" style={{ opacity: d.rulesEnabled ? 1 : 0.55, pointerEvents: d.rulesEnabled ? 'auto' : 'none' }}>
        <div className="card-hd"><div className="card-title"><Icon name="megaphone" /> نشر لوحة القوانين</div></div>
        <div className="field"><label>القناة</label><Select value={postChannel} onChange={setPostChannel} options={channels} placeholder="اختر قناة" /></div>
        <button className="btn btn-ghost btn-block" disabled={!postChannel || post.isPending} onClick={() => postChannel && post.mutate(postChannel, { onSuccess: () => toast('تم النشر'), onError: () => toast('تعذّر النشر — احفظ النص والرتبة أولًا', 'err') })}>نشر اللوحة</button>
      </div>
    </div>
  );
}
