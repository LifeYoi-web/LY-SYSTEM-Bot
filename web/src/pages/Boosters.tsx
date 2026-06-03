import { useEffect, useState } from 'react';
import { useBoosters, useUpdateBoosters, type BoosterConfig } from '../lib/community';
import { Icon } from '../lib/icons';
import { Switch, SkeletonRows, EmptyState, toast, clampInt, relTime } from '../components/ui';
import { Select, MultiSelect, useChannelOptions, useRoleOptions } from '../components/pickers';

export function Boosters() {
  const { data, isLoading } = useBoosters();
  const save = useUpdateBoosters();
  const channels = useChannelOptions(['text']);
  const roles = useRoleOptions();
  const [d, setD] = useState<BoosterConfig | null>(null);
  useEffect(() => { if (data?.config && !d) setD(data.config); }, [data, d]);
  if (isLoading || !d) return <SkeletonRows rows={5} />;
  const set = <K extends keyof BoosterConfig>(k: K, v: BoosterConfig[K]) => setD({ ...d, [k]: v });

  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <p className="page-intro" style={{ margin: 0 }}>تتبّع بوست النيترو ومنح رتب ومكافآت تلقائيًا للداعمين.</p>

      <div className="card card-pad">
        <div className="toggle-row"><div><div className="tr-title">تفعيل تتبّع الداعمين</div><div className="tr-sub">يراقب بوست النيترو ويمنح الرتب والمكافآت تلقائيًا.</div></div><Switch checked={d.enabled} onChange={(v) => set('enabled', v)} /></div>

        <div className="field" style={{ marginTop: 14 }}><label>قناة الإعلان</label><Select value={d.announceChannelId} onChange={(v) => set('announceChannelId', v)} options={channels} placeholder="اختر قناة" /></div>

        <div className="field">
          <label>رسالة الترحيب بالداعم</label>
          <textarea className="input" rows={3} value={d.message ?? ''} onChange={(e) => set('message', e.target.value || null)} placeholder="شكرًا {user} على دعم {server}!" />
          <div className="hint">متغيّرات: {'{user}'} {'{server}'} {'{count}'}</div>
        </div>

        <div className="field"><label>رتب الداعمين</label><MultiSelect value={d.perkRoleIds} onChange={(v) => set('perkRoleIds', v)} options={roles} /></div>

        <div className="field" style={{ marginBottom: 0 }}>
          <label>مكافأة عملة عند البوست</label>
          <input className="input tnum" type="number" value={d.coinBonus} onChange={(e) => set('coinBonus', clampInt(e.target.value, 0, 1000000))} />
        </div>
      </div>

      <div className="row">
        <button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate({
          enabled: d.enabled, announceChannelId: d.announceChannelId, message: d.message, perkRoleIds: d.perkRoleIds, coinBonus: d.coinBonus,
        }, { onSuccess: () => toast('تم الحفظ'), onError: () => toast('فشل الحفظ', 'err') })}><Icon name="check" /> حفظ</button>
      </div>

      <div className="card card-pad">
        <div className="card-hd"><div className="card-title"><Icon name="sparkles" /> الداعمون الحاليون</div></div>
        {data && data.boosters.length > 0 ? (
          <div className="feed">
            {data.boosters.map((b) => (
              <div className="feed-item" key={b.userId}>
                <div className="feed-ico"><Icon name="sparkles" /></div>
                <div className="feed-body">
                  <div className="ft mono">{b.userId}</div>
                  <div className="fs">منذ {relTime(b.startedAt)}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon="sparkles" title="لا يوجد داعمون بعد" sub="سيظهر الداعمون هنا عند بوست السيرفر." />
        )}
      </div>
    </div>
  );
}
