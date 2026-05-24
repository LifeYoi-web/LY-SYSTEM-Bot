import { useEffect, useState } from 'react';
import { useSuggestions, useUpdateSuggestionConfig, useSuggestionDecision, type SuggestionConfig } from '../lib/community';
import { Icon } from '../lib/icons';
import { Switch, SkeletonRows, EmptyState, toast } from '../components/ui';
import { Select, useChannelOptions } from '../components/pickers';

const STATUS: Record<string, { cls: string; label: string }> = {
  pending: { cls: 'badge-warn', label: 'قيد المراجعة' },
  approved: { cls: 'badge-active', label: 'مقبول' },
  denied: { cls: 'badge-ban', label: 'مرفوض' },
};

export function Suggestions() {
  const { data, isLoading } = useSuggestions();
  const save = useUpdateSuggestionConfig();
  const decide = useSuggestionDecision();
  const channels = useChannelOptions(['text', 'announcement']);
  const [cfg, setCfg] = useState<SuggestionConfig | null>(null);
  // Initialize once so a list refetch (after approve/deny) doesn't clobber unsaved config edits.
  useEffect(() => { if (data?.config && !cfg) setCfg(data.config); }, [data, cfg]);

  return (
    <div className="stack" style={{ maxWidth: 880 }}>
      {cfg && (
        <div className="card card-pad">
          <div className="toggle-row" style={{ padding: 0, border: 'none', marginBottom: 14 }}>
            <div className="row"><div className="kpi-ico" style={{ background: 'var(--accent-soft)' }}><Icon name="sparkles" /></div><div><div className="tr-title" style={{ fontSize: 16 }}>نظام الاقتراحات</div><div className="tr-sub">الأعضاء يقترحون ويصوّتون عبر <code>/suggest</code>.</div></div></div>
            <Switch checked={cfg.enabled} onChange={(v) => setCfg({ ...cfg, enabled: v })} />
          </div>
          <div className="field-row" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: 1 }}><label>قناة الاقتراحات</label><Select value={cfg.channelId} onChange={(v) => setCfg({ ...cfg, channelId: v })} options={channels} placeholder="اختر قناة" /></div>
            <button className="btn btn-primary" style={{ marginBottom: 18 }} disabled={save.isPending} onClick={() => save.mutate({ enabled: cfg.enabled, channelId: cfg.channelId }, { onSuccess: () => toast('تم الحفظ'), onError: () => toast('فشل', 'err') })}><Icon name="check" /> حفظ</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <SkeletonRows rows={4} />
      ) : !data || data.suggestions.length === 0 ? (
        <div className="card"><EmptyState icon="sparkles" title="لا اقتراحات بعد" /></div>
      ) : (
        <div className="stack">
          {data.suggestions.map((s) => {
            const st = STATUS[s.status] ?? STATUS.pending;
            return (
              <div className="card card-pad" key={s.id}>
                <div className="between">
                  <span className={`badge ${st.cls}`}>{st.label}</span>
                  <span className="muted" style={{ fontSize: 13 }}>👍 {s.up} • 👎 {s.down}</span>
                </div>
                <p style={{ margin: '10px 0 0', fontSize: 14.5 }}>{s.content}</p>
                <div className="fs faint" style={{ marginTop: 6 }}>بواسطة {s.authorId}</div>
                {s.status === 'pending' && (
                  <div className="row" style={{ marginTop: 12, gap: 8 }}>
                    <button className="btn btn-success btn-sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: s.id, decision: 'approve' }, { onSuccess: () => toast('تم القبول') })}><Icon name="check" /> قبول</button>
                    <button className="btn btn-danger btn-sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: s.id, decision: 'deny' }, { onSuccess: () => toast('تم الرفض') })}><Icon name="x" /> رفض</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
