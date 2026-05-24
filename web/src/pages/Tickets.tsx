import { useEffect, useState } from 'react';
import { useTickets, useUpdateTicketConfig, usePostTicketPanel, type TicketConfig } from '../lib/community';
import { Icon } from '../lib/icons';
import { Switch, SkeletonRows, EmptyState, toast, relTime } from '../components/ui';
import { Select, useChannelOptions, useRoleOptions } from '../components/pickers';

export function Tickets() {
  const { data, isLoading } = useTickets();
  const save = useUpdateTicketConfig();
  const postPanel = usePostTicketPanel();
  const categories = useChannelOptions(['category']);
  const textChannels = useChannelOptions(['text', 'announcement']);
  const roles = useRoleOptions();
  const [d, setD] = useState<TicketConfig | null>(null);
  const [panelChannel, setPanelChannel] = useState<string | null>(null);
  useEffect(() => { if (data?.config) setD(data.config); }, [data]);
  if (isLoading || !d) return <SkeletonRows rows={5} />;
  const set = <K extends keyof TicketConfig>(k: K, v: TicketConfig[K]) => setD({ ...d, [k]: v });

  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <div className="grid grid-2">
        <div className="stack">
          <div className="card card-pad" style={{ borderColor: d.enabled ? 'var(--accent-line)' : undefined }}>
            <div className="toggle-row" style={{ padding: 0, border: 'none' }}>
              <div className="row"><div className="kpi-ico" style={{ background: 'var(--accent-soft)' }}><Icon name="message" /></div><div><div className="tr-title" style={{ fontSize: 16 }}>نظام التذاكر</div><div className="tr-sub">دعم خاص لكل عضو بضغطة زر.</div></div></div>
              <Switch checked={d.enabled} onChange={(v) => set('enabled', v)} />
            </div>
          </div>
          <div className="card card-pad" style={{ opacity: d.enabled ? 1 : 0.55, pointerEvents: d.enabled ? 'auto' : 'none' }}>
            <div className="field"><label>تصنيف التذاكر (Category)</label><Select value={d.categoryId} onChange={(v) => set('categoryId', v)} options={categories} placeholder="بدون تصنيف" /></div>
            <div className="field"><label>رتبة الدعم</label><Select value={d.supportRoleId} onChange={(v) => set('supportRoleId', v)} options={roles} placeholder="بدون" /></div>
            <div className="field" style={{ marginBottom: 0 }}><label>رسالة الترحيب في التذكرة</label><textarea className="textarea" value={d.openMessage ?? ''} onChange={(e) => set('openMessage', e.target.value)} placeholder="اشرح مشكلتك وفريق الدعم بيساعدك..." /></div>
          </div>
          <div className="row"><button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate({ enabled: d.enabled, categoryId: d.categoryId, supportRoleId: d.supportRoleId, openMessage: d.openMessage }, { onSuccess: () => toast('تم الحفظ'), onError: () => toast('فشل', 'err') })}><Icon name="check" /> حفظ</button></div>
        </div>

        <div className="stack">
          <div className="card card-pad">
            <div className="card-hd"><div className="card-title"><Icon name="megaphone" /> نشر لوحة الفتح</div></div>
            <div className="field"><label>القناة</label><Select value={panelChannel} onChange={setPanelChannel} options={textChannels} placeholder="اختر قناة" /></div>
            <button className="btn btn-ghost btn-block" disabled={!panelChannel || postPanel.isPending} onClick={() => panelChannel && postPanel.mutate(panelChannel, { onSuccess: () => toast('تم نشر اللوحة'), onError: () => toast('تعذّر النشر', 'err') })}>نشر زر «افتح تذكرة»</button>
          </div>
          <div className="card card-pad">
            <div className="card-hd"><div className="card-title"><Icon name="scroll" /> التذاكر المفتوحة ({data?.tickets.length ?? 0})</div></div>
            {!data || data.tickets.length === 0 ? (
              <EmptyState icon="check-circle" title="لا تذاكر مفتوحة" />
            ) : (
              <div className="feed">
                {data.tickets.map((t) => (
                  <div className="feed-item" key={t.id}>
                    <div className="feed-ico"><Icon name="message" /></div>
                    <div className="feed-body"><div className="ft">تذكرة #{t.number} — <span className="mono">{t.userId}</span></div><div className="fs">{relTime(t.createdAt)}</div></div>
                    <a className="badge badge-active" href={`https://discord.com/channels/${data.config.guildId}/${t.channelId}`} target="_blank" rel="noreferrer">فتح</a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
