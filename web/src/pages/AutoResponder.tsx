import { useState } from 'react';
import { useAutoResponders, useSaveAutoResponder, useDeleteAutoResponder } from '../lib/hooks';
import { Icon } from '../lib/icons';
import { SkeletonRows, EmptyState, Switch, toast } from '../components/ui';

const MATCH_LABEL: Record<string, string> = { contains: 'يحتوي', exact: 'مطابق', startswith: 'يبدأ بـ' };

export function AutoResponder() {
  const { data, isLoading } = useAutoResponders();
  const save = useSaveAutoResponder();
  const del = useDeleteAutoResponder();
  const [trigger, setTrigger] = useState('');
  const [reply, setReply] = useState('');
  const [matchType, setMatchType] = useState('contains');

  function add() {
    if (!trigger.trim() || !reply.trim()) return toast('أدخل الكلمة والرد', 'err');
    save.mutate(
      { trigger: trigger.trim(), reply: reply.trim(), matchType },
      { onSuccess: () => { toast('تمت الإضافة'); setTrigger(''); setReply(''); }, onError: () => toast('فشل', 'err') },
    );
  }

  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <p className="page-intro" style={{ margin: 0 }}>عرّف كلمات مفتاحية يرد عليها البوت تلقائيًا.</p>

      <div className="card card-pad">
        <div className="card-hd"><div className="card-title"><Icon name="message" /> رد جديد</div></div>
        <div className="field-row">
          <div className="field" style={{ flex: 1 }}><label>الكلمة المفتاحية</label><input className="input" value={trigger} onChange={(e) => setTrigger(e.target.value)} placeholder="مثال: السلام" /></div>
          <div className="field" style={{ flex: '0 0 160px' }}>
            <label>نوع المطابقة</label>
            <select className="select" value={matchType} onChange={(e) => setMatchType(e.target.value)}>
              <option value="contains">يحتوي</option>
              <option value="exact">مطابق تمامًا</option>
              <option value="startswith">يبدأ بـ</option>
            </select>
          </div>
        </div>
        <div className="field" style={{ marginBottom: 14 }}><label>الرد</label><textarea className="textarea" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="وعليكم السلام ورحمة الله 🌹" /></div>
        <button className="btn btn-primary" disabled={save.isPending} onClick={add}><Icon name="plus" /> إضافة</button>
      </div>

      {isLoading ? (
        <SkeletonRows rows={4} />
      ) : !data || data.items.length === 0 ? (
        <div className="card"><EmptyState icon="message" title="لا ردود تلقائية" sub="أضف أول رد من الأعلى." /></div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>الكلمة</th><th>النوع</th><th>الرد</th><th>مفعّل</th><th></th></tr></thead>
              <tbody>
                {data.items.map((it) => (
                  <tr key={it.id}>
                    <td style={{ fontWeight: 700 }}>{it.trigger}</td>
                    <td><span className="badge badge-mute">{MATCH_LABEL[it.matchType] ?? it.matchType}</span></td>
                    <td style={{ maxWidth: 260, color: 'var(--muted)' }}>{it.reply}</td>
                    <td><Switch checked={it.enabled} onChange={(v) => save.mutate({ id: it.id, enabled: v })} /></td>
                    <td><button className="icon-btn" onClick={() => del.mutate(it.id)} aria-label="حذف"><Icon name="trash" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
