import { useEffect, useState } from 'react';
import { useInvites, useUpdateInviteConfig, type InviteConfig } from '../lib/community';
import { Icon } from '../lib/icons';
import { Switch, SkeletonRows, EmptyState, toast, clampInt, fmt } from '../components/ui';
import { Select, useChannelOptions, useRoleOptions } from '../components/pickers';

export function Invites() {
  const { data, isLoading } = useInvites();
  const save = useUpdateInviteConfig();
  const roles = useRoleOptions();
  const channels = useChannelOptions(['text']);
  const [d, setD] = useState<InviteConfig | null>(null);
  useEffect(() => { if (data && !d) setD(data.config); }, [data, d]);
  if (isLoading || !d || !data) return <SkeletonRows rows={5} />;
  const set = <K extends keyof InviteConfig>(k: K, v: InviteConfig[K]) => setD({ ...d, [k]: v });
  const board = [...data.leaderboard].sort((a, b) => b.regular - a.regular);

  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <p className="page-intro" style={{ margin: 0 }}>تتبّع من دعا كل عضو، مع لوحة متصدّرين للداعين.</p>
      <div className="card card-pad">
        <div className="toggle-row"><div><div className="tr-title">تفعيل تتبّع الدعوات</div></div><Switch checked={d.enabled} onChange={(v) => set('enabled', v)} /></div>
        <div className="field" style={{ marginTop: 14 }}><label>أيام اعتبار الحساب وهميًا</label><input className="input tnum" type="number" value={d.fakeDays} onChange={(e) => set('fakeDays', clampInt(e.target.value, 0, 365))} /><div className="hint">الأيام التي يُعتبر تحتها الحساب وهميًا.</div></div>
        <div className="field" style={{ marginTop: 14 }}><label>رتبة المكافأة</label><Select value={d.rewardRoleId ?? ''} onChange={(v) => set('rewardRoleId', v || null)} options={roles} placeholder="بدون رتبة مكافأة" /></div>
        <div className="field" style={{ marginTop: 14 }}><label>عدد الدعوات لمنح رتبة المكافأة</label><input className="input tnum" type="number" value={d.rewardThreshold} onChange={(e) => set('rewardThreshold', clampInt(e.target.value, 0, 100000))} /><div className="hint">عدد الدعوات لمنح رتبة المكافأة (0=إيقاف).</div></div>
        <div className="field" style={{ marginTop: 14 }}><label>قناة السجلّ</label><Select value={d.logChannelId ?? ''} onChange={(v) => set('logChannelId', v || null)} options={channels} placeholder="اختر قناة" /></div>
      </div>
      <div className="row">
        <button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate({ enabled: d.enabled, fakeDays: d.fakeDays, rewardRoleId: d.rewardRoleId, rewardThreshold: d.rewardThreshold, logChannelId: d.logChannelId }, { onSuccess: () => toast('تم الحفظ'), onError: () => toast('فشل الحفظ', 'err') })}><Icon name="check" /> حفظ</button>
      </div>
      <div className="card card-pad">
        <div className="card-hd"><div className="card-title">🏆 لوحة الداعين</div></div>
        {board.length === 0 ? (
          <EmptyState icon="users" title="لا دعوات بعد" sub="ستظهر هنا أرقام الداعين عند انضمام أعضاء جدد." />
        ) : (
          <div className="feed">
            {board.map((s, i) => (
              <div className="feed-item" key={s.userId}>
                <div className="feed-ico">{fmt(i + 1)}</div>
                <div className="feed-body">
                  <div className="ft mono">{s.userId}</div>
                  <div className="fs">{fmt(s.regular)} صالحة · {fmt(s.fake)} وهمية · {fmt(s.left)} غادروا</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
