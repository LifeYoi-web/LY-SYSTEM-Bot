import { useEffect, useState } from 'react';
import {
  useTickets,
  useUpdateTicketConfig,
  usePostTicketPanel,
  useSaveTicketType,
  useDeleteTicketType,
  useCloseTicket,
  useReopenTicket,
  type TicketConfig,
  type TicketType,
} from '../lib/community';
import { Icon } from '../lib/icons';
import { Switch, SkeletonRows, EmptyState, toast, relTime } from '../components/ui';
import { Select, useChannelOptions, useRoleOptions } from '../components/pickers';

type TypeDraft = Partial<TicketType> & { id?: string };

export function Tickets() {
  const { data, isLoading } = useTickets();
  const save = useUpdateTicketConfig();
  const postPanel = usePostTicketPanel();
  const saveType = useSaveTicketType();
  const delType = useDeleteTicketType();
  const closeTicket = useCloseTicket();
  const reopenTicket = useReopenTicket();
  const categories = useChannelOptions(['category']);
  const textChannels = useChannelOptions(['text', 'announcement']);
  const roles = useRoleOptions();
  const [d, setD] = useState<TicketConfig | null>(null);
  const [panelChannel, setPanelChannel] = useState<string | null>(null);
  const [editing, setEditing] = useState<TypeDraft | null>(null);
  useEffect(() => { if (data?.config) setD(data.config); }, [data]);
  if (isLoading || !d) return <SkeletonRows rows={6} />;

  const set = <K extends keyof TicketConfig>(k: K, v: TicketConfig[K]) => setD({ ...d, [k]: v });
  const setE = <K extends keyof TicketType>(k: K, v: TicketType[K]) => setEditing((e) => ({ ...e, [k]: v }));
  const types = data?.types ?? [];
  const typeLabel = (id: string | null) => (id ? types.find((t) => t.id === id)?.label ?? 'محذوف' : 'افتراضي');

  const saveTypeNow = () => {
    if (!editing?.label?.trim()) return toast('الاسم مطلوب', 'err');
    saveType.mutate(editing, {
      onSuccess: () => { toast('تم حفظ النوع'); setEditing(null); },
      onError: () => toast('فشل الحفظ', 'err'),
    });
  };

  return (
    <div className="stack" style={{ maxWidth: 960 }}>
      {/* enable */}
      <div className="card card-pad" style={{ borderColor: d.enabled ? 'var(--accent-line)' : undefined }}>
        <div className="toggle-row" style={{ padding: 0, border: 'none' }}>
          <div className="row"><div className="kpi-ico" style={{ background: 'var(--accent-soft)' }}><Icon name="message" /></div><div><div className="tr-title" style={{ fontSize: 16 }}>نظام التذاكر</div><div className="tr-sub">دعم خاص لكل عضو بضغطة زر، مع نسخة محادثة عند الإغلاق.</div></div></div>
          <Switch checked={d.enabled} onChange={(v) => set('enabled', v)} />
        </div>
      </div>

      <div className="grid grid-2" style={{ opacity: d.enabled ? 1 : 0.55, pointerEvents: d.enabled ? 'auto' : 'none' }}>
        {/* settings */}
        <div className="stack">
          <div className="card card-pad">
            <div className="card-hd"><div className="card-title"><Icon name="settings" /> الإعدادات</div></div>
            <div className="field"><label>قناة حفظ النسخ (Transcripts)</label><Select value={d.transcriptChannelId} onChange={(v) => set('transcriptChannelId', v)} options={textChannels} placeholder="قناة السجل الافتراضية" /></div>
            <div className="toggle-row"><div><div className="tr-title">رسالة خاصة عند الفتح</div></div><Switch checked={d.dmOnOpen} onChange={(v) => set('dmOnOpen', v)} /></div>
            <div className="toggle-row"><div><div className="tr-title">رسالة خاصة + نسخة عند الإغلاق</div></div><Switch checked={d.dmOnClose} onChange={(v) => set('dmOnClose', v)} /></div>
            <div style={{ borderTop: '1px solid var(--line, #2a2f3a)', margin: '4px 0 12px' }} />
            <div className="tr-sub" style={{ marginBottom: 8 }}>النوع الافتراضي (يُستخدم لو ما فيه أنواع مخصّصة):</div>
            <div className="field"><label>التصنيف الافتراضي</label><Select value={d.categoryId} onChange={(v) => set('categoryId', v)} options={categories} placeholder="بدون" /></div>
            <div className="field"><label>رتبة الدعم الافتراضية</label><Select value={d.supportRoleId} onChange={(v) => set('supportRoleId', v)} options={roles} placeholder="بدون" /></div>
            <div className="field" style={{ marginBottom: 0 }}><label>رسالة الترحيب الافتراضية</label><textarea className="textarea" value={d.openMessage ?? ''} onChange={(e) => set('openMessage', e.target.value)} placeholder="اشرح مشكلتك وفريق الدعم بيساعدك..." /></div>
          </div>
          <div className="row"><button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate({ enabled: d.enabled, categoryId: d.categoryId, supportRoleId: d.supportRoleId, openMessage: d.openMessage, transcriptChannelId: d.transcriptChannelId, dmOnOpen: d.dmOnOpen, dmOnClose: d.dmOnClose }, { onSuccess: () => toast('تم الحفظ'), onError: () => toast('فشل', 'err') })}><Icon name="check" /> حفظ الإعدادات</button></div>
        </div>

        {/* panel */}
        <div className="stack">
          <div className="card card-pad">
            <div className="card-hd"><div className="card-title"><Icon name="megaphone" /> نشر لوحة الفتح</div></div>
            <div className="tr-sub" style={{ marginBottom: 10 }}>لو فيه أنواع مفعّلة بتظهر كقائمة منسدلة، وإلا زر واحد.</div>
            <div className="field"><label>القناة</label><Select value={panelChannel} onChange={setPanelChannel} options={textChannels} placeholder="اختر قناة" /></div>
            <button className="btn btn-ghost btn-block" disabled={!panelChannel || postPanel.isPending} onClick={() => panelChannel && postPanel.mutate(panelChannel, { onSuccess: () => toast('تم نشر اللوحة'), onError: () => toast('تعذّر النشر', 'err') })}>نشر اللوحة</button>
          </div>
        </div>
      </div>

      {/* ticket types */}
      <div className="card card-pad" style={{ opacity: d.enabled ? 1 : 0.55, pointerEvents: d.enabled ? 'auto' : 'none' }}>
        <div className="card-hd">
          <div className="card-title"><Icon name="tag" /> أنواع التذاكر ({types.length})</div>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing({ label: '', emoji: '', pingSupport: true, enabled: true, position: types.length })}><Icon name="plus" /> إضافة نوع</button>
        </div>

        {editing && (
          <div className="card card-pad" style={{ background: 'var(--accent-soft)', borderColor: 'var(--accent-line)', marginBottom: 12 }}>
            <div className="grid grid-2">
              <div className="field"><label>الاسم</label><input className="input" value={editing.label ?? ''} onChange={(e) => setE('label', e.target.value)} placeholder="دعم فني" maxLength={80} /></div>
              <div className="field"><label>الإيموجي (اختياري)</label><input className="input" value={editing.emoji ?? ''} onChange={(e) => setE('emoji', e.target.value || null)} placeholder="🎫" maxLength={8} /></div>
              <div className="field"><label>التصنيف</label><Select value={editing.categoryId ?? null} onChange={(v) => setE('categoryId', v)} options={categories} placeholder="افتراضي" /></div>
              <div className="field"><label>رتبة الدعم</label><Select value={editing.supportRoleId ?? null} onChange={(v) => setE('supportRoleId', v)} options={roles} placeholder="افتراضية" /></div>
            </div>
            <div className="field"><label>رسالة الترحيب</label><textarea className="textarea" value={editing.openMessage ?? ''} onChange={(e) => setE('openMessage', e.target.value || null)} placeholder="اتركها فارغة للنص الافتراضي" /></div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <label className="row" style={{ gap: 8, cursor: 'pointer' }}><Switch checked={editing.pingSupport ?? true} onChange={(v) => setE('pingSupport', v)} /> منشن رتبة الدعم</label>
              <label className="row" style={{ gap: 8, cursor: 'pointer' }}><Switch checked={editing.enabled ?? true} onChange={(v) => setE('enabled', v)} /> مُفعّل</label>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn btn-primary" disabled={saveType.isPending} onClick={saveTypeNow}><Icon name="check" /> حفظ النوع</button>
              <button className="btn btn-ghost" onClick={() => setEditing(null)}>إلغاء</button>
            </div>
          </div>
        )}

        {types.length === 0 ? (
          <EmptyState icon="tag" title="لا أنواع مخصّصة" sub="بيُستخدم النوع الافتراضي. أضف أنواعًا لعرض قائمة منسدلة." />
        ) : (
          <div className="feed">
            {types.map((t) => (
              <div className="feed-item" key={t.id}>
                <div className="feed-ico">{t.emoji || <Icon name="tag" />}</div>
                <div className="feed-body"><div className="ft">{t.label} {!t.enabled && <span className="badge">معطّل</span>}</div><div className="fs">{t.supportRoleId ? 'رتبة خاصة' : 'رتبة افتراضية'} · ترتيب {t.position}</div></div>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditing({ ...t })}><Icon name="edit" /></button>
                  <button className="btn btn-ghost btn-sm" onClick={() => window.confirm(`حذف النوع «${t.label}»؟`) && delType.mutate(t.id, { onSuccess: () => toast('تم الحذف'), onError: () => toast('فشل', 'err') })}><Icon name="trash" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* open + closed */}
      <div className="grid grid-2">
        <div className="card card-pad">
          <div className="card-hd"><div className="card-title"><Icon name="scroll" /> التذاكر المفتوحة ({data?.tickets.length ?? 0})</div></div>
          {!data || data.tickets.length === 0 ? (
            <EmptyState icon="check-circle" title="لا تذاكر مفتوحة" />
          ) : (
            <div className="feed">
              {data.tickets.map((t) => (
                <div className="feed-item" key={t.id}>
                  <div className="feed-ico"><Icon name="message" /></div>
                  <div className="feed-body"><div className="ft">تذكرة #{t.number} · {typeLabel(t.typeId)} {t.claimedBy && <span className="badge badge-active">مستلمة</span>}</div><div className="fs"><span className="mono">{t.userId}</span> · {relTime(t.createdAt)}</div></div>
                  <div className="row" style={{ gap: 6 }}>
                    <a className="btn btn-ghost btn-sm" href={`https://discord.com/channels/${data.config.guildId}/${t.channelId}`} target="_blank" rel="noreferrer">فتح</a>
                    <button className="btn btn-ghost btn-sm" disabled={closeTicket.isPending} onClick={() => window.confirm(`إغلاق التذكرة #${t.number}؟`) && closeTicket.mutate(t.id, { onSuccess: () => toast('تم الإغلاق'), onError: () => toast('فشل', 'err') })}><Icon name="lock" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card card-pad">
          <div className="card-hd"><div className="card-title"><Icon name="archive" /> التذاكر المغلقة ({data?.closed.length ?? 0})</div></div>
          {!data || data.closed.length === 0 ? (
            <EmptyState icon="scroll" title="لا تذاكر مغلقة" />
          ) : (
            <div className="feed">
              {data.closed.map((c) => (
                <div className="feed-item" key={c.id}>
                  <div className="feed-ico"><Icon name="archive" /></div>
                  <div className="feed-body"><div className="ft">تذكرة #{c.number} · {typeLabel(c.typeId)}</div><div className="fs"><span className="mono">{c.userId}</span> · {c.closedAt ? relTime(c.closedAt) : ''}</div></div>
                  <div className="row" style={{ gap: 6 }}>
                    {c.transcriptId && <a className="btn btn-ghost btn-sm" href={`/api/tickets/transcripts/${c.transcriptId}`} target="_blank" rel="noreferrer">النسخة</a>}
                    <button className="btn btn-ghost btn-sm" disabled={reopenTicket.isPending} onClick={() => reopenTicket.mutate(c.id, { onSuccess: () => toast('تم إعادة الفتح'), onError: () => toast('فشل', 'err') })}><Icon name="unlock" /></button>
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
