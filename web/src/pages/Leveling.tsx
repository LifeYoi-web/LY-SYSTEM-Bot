import { useEffect, useState } from 'react';
import { useLeveling, useUpdateLeveling, useLeaderboard, useAddReward, useDeleteReward } from '../lib/hooks';
import type { LevelConfig } from '../lib/types';
import { Icon } from '../lib/icons';
import { Switch, SkeletonRows, EmptyState, toast, fmt, clampInt } from '../components/ui';
import { Select, MultiSelect, useChannelOptions, useRoleOptions } from '../components/pickers';

export function Leveling() {
  const { data, isLoading } = useLeveling();
  const lb = useLeaderboard();
  const save = useUpdateLeveling();
  const addReward = useAddReward();
  const delReward = useDeleteReward();
  const channels = useChannelOptions(['text', 'announcement']);
  const voiceChannels = useChannelOptions(['voice']);
  const roles = useRoleOptions();
  const [d, setD] = useState<LevelConfig | null>(null);
  const [rwLevel, setRwLevel] = useState(5);
  const [rwRole, setRwRole] = useState<string | null>(null);

  useEffect(() => {
    if (data?.config) setD(data.config);
  }, [data]);

  if (isLoading || !d) return <SkeletonRows rows={6} />;
  const set = <K extends keyof LevelConfig>(k: K, v: LevelConfig[K]) => setD({ ...d, [k]: v });

  function submit() {
    if (!d) return;
    save.mutate(
      {
        enabled: d.enabled, xpPerMessage: d.xpPerMessage, cooldownSeconds: d.cooldownSeconds, multiplier: d.multiplier,
        levelUpEnabled: d.levelUpEnabled, levelUpChannelId: d.levelUpChannelId, levelUpMessage: d.levelUpMessage, stackRewards: d.stackRewards,
        voiceXpEnabled: d.voiceXpEnabled, voiceXpPerMinute: d.voiceXpPerMinute, ignoredVoiceChannelIds: d.ignoredVoiceChannelIds,
      },
      { onSuccess: () => toast('تم حفظ إعدادات المستويات'), onError: () => toast('فشل الحفظ', 'err') },
    );
  }
  function addRewardRow() {
    if (!rwRole) return toast('اختر رتبة أولًا', 'err');
    addReward.mutate({ level: rwLevel, roleId: rwRole }, { onSuccess: () => { toast('تمت إضافة المكافأة'); setRwRole(null); }, onError: () => toast('فشل', 'err') });
  }
  const roleName = (id: string) => roles.find((r) => r.id === id)?.label ?? id;

  return (
    <div className="stack" style={{ maxWidth: 920 }}>
      <div className="grid grid-2">
        <div className="stack">
          <div className="card card-pad" style={{ borderColor: d.enabled ? 'var(--accent-line)' : undefined }}>
            <div className="toggle-row" style={{ padding: 0, border: 'none' }}>
              <div className="row">
                <div className="kpi-ico" style={{ background: 'var(--accent-soft)' }}><Icon name="bar-chart" /></div>
                <div>
                  <div className="tr-title" style={{ fontSize: 16 }}>نظام المستويات</div>
                  <div className="tr-sub">منح XP للأعضاء على نشاطهم.</div>
                </div>
              </div>
              <Switch checked={d.enabled} onChange={(v) => set('enabled', v)} label="تفعيل المستويات" />
            </div>
          </div>

          <div className="card card-pad" style={{ opacity: d.enabled ? 1 : 0.55, pointerEvents: d.enabled ? 'auto' : 'none' }}>
            <div className="field-row">
              <div className="field">
                <label>XP لكل رسالة</label>
                <input className="input tnum" type="number" min={1} max={100} value={d.xpPerMessage} onChange={(e) => set('xpPerMessage', clampInt(e.target.value, 1, 100))} />
              </div>
              <div className="field">
                <label>المضاعِف</label>
                <input className="input tnum" type="number" min={1} max={5} value={d.multiplier} onChange={(e) => set('multiplier', clampInt(e.target.value, 1, 5))} />
              </div>
              <div className="field">
                <label>التهدئة (ثوانٍ)</label>
                <input className="input tnum" type="number" min={0} max={3600} value={d.cooldownSeconds} onChange={(e) => set('cooldownSeconds', clampInt(e.target.value, 0, 3600))} />
              </div>
            </div>
            <div className="toggle-row">
              <div><div className="tr-title">رسالة ترقية المستوى</div><div className="tr-sub">إشعار عند صعود العضو مستوى.</div></div>
              <Switch checked={d.levelUpEnabled} onChange={(v) => set('levelUpEnabled', v)} />
            </div>
            {d.levelUpEnabled && (
              <>
                <div className="field" style={{ marginTop: 14 }}>
                  <label>قناة الترقية (فارغ = نفس القناة)</label>
                  <Select value={d.levelUpChannelId} onChange={(v) => set('levelUpChannelId', v)} options={channels} placeholder="نفس قناة الرسالة" />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>نص الترقية</label>
                  <input className="input" value={d.levelUpMessage ?? ''} onChange={(e) => set('levelUpMessage', e.target.value)} placeholder="🎉 مبروك {user}! وصلت المستوى {level}." />
                  <div className="hint">متغيّرات: {'{user}'} • {'{level}'}</div>
                </div>
              </>
            )}
          </div>

          <div className="card card-pad" style={{ opacity: d.enabled ? 1 : 0.55, pointerEvents: d.enabled ? 'auto' : 'none' }}>
            <div className="card-hd"><div className="card-title"><Icon name="crown" /> مكافآت الرتب</div></div>
            <div className="toggle-row">
              <div><div className="tr-title">تكديس المكافآت</div><div className="tr-sub">إبقاء كل رتب المستويات السابقة بدل استبدالها.</div></div>
              <Switch checked={d.stackRewards} onChange={(v) => set('stackRewards', v)} />
            </div>
            <div className="field-row" style={{ marginTop: 14, alignItems: 'flex-end' }}>
              <div className="field" style={{ flex: '0 0 120px' }}>
                <label>المستوى</label>
                <input className="input tnum" type="number" min={1} value={rwLevel} onChange={(e) => setRwLevel(clampInt(e.target.value, 1, 1000))} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>الرتبة</label>
                <Select value={rwRole} onChange={setRwRole} options={roles} placeholder="اختر رتبة" />
              </div>
              <button className="btn btn-ghost" style={{ marginBottom: 18 }} onClick={addRewardRow} disabled={addReward.isPending}><Icon name="plus" /> إضافة</button>
            </div>
            {data?.rewards.length ? (
              <div className="chips">
                {data.rewards.map((r) => (
                  <span className="chip" key={r.id}>
                    مستوى {r.level} → {roleName(r.roleId)}
                    <button onClick={() => delReward.mutate(r.id)} aria-label="حذف"><Icon name="x" /></button>
                  </span>
                ))}
              </div>
            ) : (
              <div className="hint">لا مكافآت بعد.</div>
            )}
          </div>

          <div className="card card-pad" style={{ opacity: d.enabled ? 1 : 0.55, pointerEvents: d.enabled ? 'auto' : 'none' }}>
            <div className="card-hd"><div className="card-title"><Icon name="mic" /> XP الصوتي</div></div>
            <div className="toggle-row">
              <div><div className="tr-title">منح XP على التواجد الصوتي</div><div className="tr-sub">يُحتسب لكل دقيقة نشطة في الرومات (غير الكاتم، وبوجود شخصين فأكثر).</div></div>
              <Switch checked={d.voiceXpEnabled} onChange={(v) => set('voiceXpEnabled', v)} />
            </div>
            {d.voiceXpEnabled && (
              <>
                <div className="field" style={{ marginTop: 14 }}>
                  <label>XP لكل دقيقة صوتية</label>
                  <input className="input tnum" type="number" min={0} max={100} value={d.voiceXpPerMinute} onChange={(e) => set('voiceXpPerMinute', clampInt(e.target.value, 0, 100))} />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>رومات صوتية مستثناة</label>
                  <MultiSelect value={d.ignoredVoiceChannelIds} onChange={(v) => set('ignoredVoiceChannelIds', v)} options={voiceChannels} />
                </div>
              </>
            )}
          </div>

          <div className="row">
            <button className="btn btn-primary" disabled={save.isPending} onClick={submit}><Icon name="check" /> {save.isPending ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}</button>
          </div>
        </div>

        <div className="card card-pad">
          <div className="card-hd"><div className="card-title"><Icon name="crown" /> المتصدّرون</div></div>
          {lb.isLoading ? (
            <SkeletonRows rows={6} />
          ) : !lb.data || lb.data.leaderboard.length === 0 ? (
            <EmptyState icon="users" title="لا بيانات بعد" sub="ستظهر هنا فور تفاعل الأعضاء." />
          ) : (
            <div className="feed">
              {lb.data.leaderboard.map((e) => (
                <div className="feed-item" key={e.userId}>
                  <div className="feed-ico" style={{ color: e.rank <= 3 ? 'var(--accent-text)' : undefined, fontWeight: 800 }}>{e.rank}</div>
                  <div className="feed-body">
                    <div className="ft mono">{e.userId}</div>
                    <div className="fs">المستوى {e.level} • {fmt(e.xp)} XP</div>
                    <div style={{ height: 5, background: 'var(--surface-3)', borderRadius: 4, marginTop: 6, overflow: 'hidden' }}>
                      <div style={{ width: `${e.progress.pct}%`, height: '100%', background: 'var(--grad-accent)' }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
