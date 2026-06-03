import { useEffect, useState } from 'react';
import { useEconomy, useUpdateEconomy, useGrantCoins, type EconomyConfig } from '../lib/community';
import { Icon } from '../lib/icons';
import { Switch, SkeletonRows, EmptyState, toast, fmt, clampInt } from '../components/ui';

export function Economy() {
  const { data, isLoading } = useEconomy();
  const save = useUpdateEconomy();
  const grant = useGrantCoins();
  const [d, setD] = useState<EconomyConfig | null>(null);
  const [grantUser, setGrantUser] = useState('');
  const [grantAmount, setGrantAmount] = useState(0);
  useEffect(() => { if (data?.config && !d) setD(data.config); }, [data, d]);
  if (isLoading || !d || !data) return <SkeletonRows rows={6} />;
  const set = <K extends keyof EconomyConfig>(k: K, v: EconomyConfig[K]) => setD({ ...d, [k]: v });

  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <p className="page-intro" style={{ margin: 0 }}>عملة افتراضية تُكتسب من الدردشة والمكافأة اليومية.</p>

      <div className="card card-pad">
        <div className="toggle-row"><div><div className="tr-title">تفعيل الاقتصاد</div></div><Switch checked={d.enabled} onChange={(v) => set('enabled', v)} /></div>
        <div className="field-row" style={{ marginTop: 14 }}>
          <div className="field"><label>اسم العملة</label><input className="input" value={d.currencyName} onChange={(e) => set('currencyName', e.target.value)} placeholder="اسم العملة" /></div>
          <div className="field"><label>رمز العملة</label><input className="input" value={d.currencyEmoji} onChange={(e) => set('currencyEmoji', e.target.value)} placeholder="رمز العملة" /></div>
        </div>
        <div className="field-row">
          <div className="field"><label>لكل رسالة</label><input className="input tnum" type="number" min={0} max={1000} value={d.perMessage} onChange={(e) => set('perMessage', clampInt(e.target.value, 0, 1000))} /></div>
          <div className="field"><label>تهدئة الكسب</label><input className="input tnum" type="number" min={0} max={3600} value={d.cooldownSeconds} onChange={(e) => set('cooldownSeconds', clampInt(e.target.value, 0, 3600))} /></div>
        </div>
        <div className="field-row">
          <div className="field"><label>المكافأة اليومية</label><input className="input tnum" type="number" min={0} max={100000} value={d.dailyAmount} onChange={(e) => set('dailyAmount', clampInt(e.target.value, 0, 100000))} /></div>
          <div className="field"><label>مكافأة السلسلة/يوم</label><input className="input tnum" type="number" min={0} max={10000} value={d.streakBonus} onChange={(e) => set('streakBonus', clampInt(e.target.value, 0, 10000))} /></div>
        </div>
        <div className="field" style={{ marginBottom: 0 }}><label>حد مكافأة السلسلة</label><input className="input tnum" type="number" min={0} max={100000} value={d.maxStreakBonus} onChange={(e) => set('maxStreakBonus', clampInt(e.target.value, 0, 100000))} /></div>
      </div>

      <div className="row">
        <button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate({ enabled: d.enabled, currencyName: d.currencyName, currencyEmoji: d.currencyEmoji, perMessage: d.perMessage, cooldownSeconds: d.cooldownSeconds, dailyAmount: d.dailyAmount, streakBonus: d.streakBonus, maxStreakBonus: d.maxStreakBonus }, { onSuccess: () => toast('تم الحفظ'), onError: () => toast('فشل الحفظ', 'err') })}><Icon name="check" /> حفظ</button>
      </div>

      <div className="card card-pad">
        <div className="card-hd"><div className="card-title"><Icon name="plus" /> منح/خصم عملة</div></div>
        <div className="field-row" style={{ marginTop: 14, alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: 1 }}><label>معرّف العضو</label><input className="input" value={grantUser} onChange={(e) => setGrantUser(e.target.value)} placeholder="User ID" /></div>
          <div className="field" style={{ flex: '0 0 140px' }}><label>الكمية</label><input className="input tnum" type="number" value={grantAmount} onChange={(e) => setGrantAmount(clampInt(e.target.value, -1000000, 1000000))} /></div>
          <button className="btn btn-ghost" style={{ marginBottom: 18 }} disabled={grant.isPending || !grantUser} onClick={() => grant.mutate({ userId: grantUser, amount: grantAmount }, { onSuccess: () => { toast('تم'); setGrantUser(''); setGrantAmount(0); }, onError: () => toast('فشل الحفظ', 'err') })}><Icon name="zap" /> تنفيذ</button>
        </div>
      </div>

      <div className="card card-pad">
        <div className="card-hd"><div className="card-title"><Icon name="crown" /> 🏆 الأثرياء</div></div>
        {data.leaderboard.length === 0 ? (
          <EmptyState icon="users" title="لا بيانات بعد" sub="ستظهر هنا فور تفاعل الأعضاء." />
        ) : (
          <div className="feed">
            {data.leaderboard.map((w, i) => (
              <div className="feed-item" key={w.userId}>
                <div className="feed-ico" style={{ color: i < 3 ? 'var(--accent-text)' : undefined, fontWeight: 800 }}>{i + 1}</div>
                <div className="feed-body">
                  <div className="ft mono">{w.userId}</div>
                  <div className="fs">{fmt(w.balance)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
