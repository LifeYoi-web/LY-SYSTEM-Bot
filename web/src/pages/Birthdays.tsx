import { useEffect, useState } from 'react';
import { useBirthdays, useUpdateBirthdayConfig, type BirthdayConfig } from '../lib/community';
import { Icon } from '../lib/icons';
import { Switch, SkeletonRows, EmptyState, toast } from '../components/ui';
import { Select, useChannelOptions, useRoleOptions } from '../components/pickers';

export function Birthdays() {
  const { data, isLoading } = useBirthdays();
  const save = useUpdateBirthdayConfig();
  const channels = useChannelOptions(['text', 'announcement']);
  const roles = useRoleOptions();
  const [cfg, setCfg] = useState<BirthdayConfig | null>(null);
  useEffect(() => { if (data?.config) setCfg(data.config); }, [data]);

  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <div className="grid grid-2">
        {cfg && (
          <div className="card card-pad">
            <div className="toggle-row" style={{ padding: 0, border: 'none', marginBottom: 14 }}>
              <div className="row"><div className="kpi-ico" style={{ background: 'var(--accent-soft)' }}><Icon name="sparkles" /></div><div><div className="tr-title" style={{ fontSize: 16 }}>أعياد الميلاد 🎂</div><div className="tr-sub">تهنئة تلقائية يوميًا.</div></div></div>
              <Switch checked={cfg.enabled} onChange={(v) => setCfg({ ...cfg, enabled: v })} />
            </div>
            <div className="field"><label>قناة التهنئة</label><Select value={cfg.channelId} onChange={(v) => setCfg({ ...cfg, channelId: v })} options={channels} placeholder="اختر قناة" /></div>
            <div className="field"><label>رتبة يوم الميلاد (اختياري)</label><Select value={cfg.roleId} onChange={(v) => setCfg({ ...cfg, roleId: v })} options={roles} placeholder="بدون" /></div>
            <button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate({ enabled: cfg.enabled, channelId: cfg.channelId, roleId: cfg.roleId }, { onSuccess: () => toast('تم الحفظ'), onError: () => toast('فشل', 'err') })}><Icon name="check" /> حفظ</button>
          </div>
        )}

        <div className="card card-pad">
          <div className="card-hd"><div className="card-title"><Icon name="calendar" /> المواليد المسجّلة ({data?.birthdays.length ?? 0})</div></div>
          {isLoading ? (
            <SkeletonRows rows={4} />
          ) : !data || data.birthdays.length === 0 ? (
            <EmptyState icon="calendar" title="لا مواليد بعد" sub="الأعضاء يسجّلون عبر /birthday set" />
          ) : (
            <div className="feed">
              {data.birthdays.map((b) => (
                <div className="feed-item" key={b.userId}>
                  <div className="feed-ico">🎂</div>
                  <div className="feed-body"><div className="ft mono">{b.userId}</div></div>
                  <span className="badge badge-warn tnum">{b.day}/{b.month}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
