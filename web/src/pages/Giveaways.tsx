import { useState } from 'react';
import { useGiveaways, useCreateGiveaway, useGiveawayAction } from '../lib/community';
import { Icon } from '../lib/icons';
import { SkeletonRows, EmptyState, toast, relTime, fmt } from '../components/ui';
import { Select, useChannelOptions } from '../components/pickers';
import { clampInt } from '../components/ui';

export function Giveaways() {
  const { data, isLoading } = useGiveaways();
  const create = useCreateGiveaway();
  const action = useGiveawayAction();
  const channels = useChannelOptions(['text', 'announcement']);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [prize, setPrize] = useState('');
  const [winnerCount, setWinnerCount] = useState(1);
  const [duration, setDuration] = useState('1d');

  function start() {
    if (!channelId) return toast('اختر قناة', 'err');
    if (!prize.trim()) return toast('اكتب الجائزة', 'err');
    create.mutate(
      { channelId, prize: prize.trim(), winnerCount, duration },
      { onSuccess: () => { toast('بدأ السحب!'); setPrize(''); }, onError: () => toast('فشل — تحقق من المدة (مثل 1d) والصلاحيات', 'err') },
    );
  }

  return (
    <div className="stack" style={{ maxWidth: 880 }}>
      <div className="card card-pad">
        <div className="card-hd"><div className="card-title"><Icon name="sparkles" /> سحب جديد</div></div>
        <div className="field-row">
          <div className="field" style={{ flex: 1 }}><label>القناة</label><Select value={channelId} onChange={setChannelId} options={channels} placeholder="اختر قناة" /></div>
          <div className="field" style={{ flex: '0 0 110px' }}><label>الفائزون</label><input className="input tnum" type="number" min={1} max={50} value={winnerCount} onChange={(e) => setWinnerCount(clampInt(e.target.value, 1, 50))} /></div>
          <div className="field" style={{ flex: '0 0 120px' }}><label>المدة</label><input className="input" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="1d / 2h / 30m" /></div>
        </div>
        <div className="field" style={{ marginBottom: 14 }}><label>الجائزة</label><input className="input" value={prize} onChange={(e) => setPrize(e.target.value)} placeholder="Discord Nitro 🎁" /></div>
        <button className="btn btn-primary" disabled={create.isPending} onClick={start}><Icon name="sparkles" /> ابدأ السحب</button>
      </div>

      {isLoading ? (
        <SkeletonRows rows={3} />
      ) : !data || data.giveaways.length === 0 ? (
        <div className="card"><EmptyState icon="sparkles" title="لا سحوبات" /></div>
      ) : (
        <div className="grid grid-2">
          {data.giveaways.map((g) => (
            <div className="card card-pad" key={g.id}>
              <div className="between">
                <div className="card-title">🎉 {g.prize}</div>
                <span className={`badge ${g.ended ? 'badge-lifted' : 'badge-active'}`}>{g.ended ? 'منتهٍ' : 'جارٍ'}</span>
              </div>
              <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
                {fmt(g.entrants.length)} مشارك • {g.winnerCount} فائز • {g.ended ? 'انتهى' : 'ينتهي'} {relTime(g.endsAt)}
              </div>
              {g.ended && g.winners.length > 0 && (
                <div className="ok-text" style={{ marginTop: 8 }}>الفائزون: {g.winners.map((w) => `@${w.slice(-4)}`).join('، ')}</div>
              )}
              <div className="row wrap" style={{ marginTop: 14, gap: 8 }}>
                {!g.ended && <button className="btn btn-ghost btn-sm" disabled={action.isPending} onClick={() => action.mutate({ id: g.id, action: 'end' }, { onSuccess: () => toast('أُنهي السحب') })}><Icon name="check" /> إنهاء الآن</button>}
                {g.ended && <button className="btn btn-ghost btn-sm" disabled={action.isPending} onClick={() => action.mutate({ id: g.id, action: 'reroll' }, { onSuccess: () => toast('أُعيد السحب') })}><Icon name="rotate-ccw" /> إعادة سحب</button>}
                <button className="btn btn-danger btn-sm" disabled={action.isPending} onClick={() => { if (window.confirm(`حذف سحب «${g.prize}»؟`)) action.mutate({ id: g.id, action: 'delete' }, { onSuccess: () => toast('تم حذف السحب'), onError: () => toast('فشل الحذف', 'err') }); }}><Icon name="trash" /> حذف</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
