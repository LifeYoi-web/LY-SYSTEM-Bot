import { useState } from 'react';
import { useScheduled, useSaveScheduled, useDeleteScheduled } from '../lib/hooks';
import { Icon } from '../lib/icons';
import { SkeletonRows, EmptyState, Switch, toast, dateTime } from '../components/ui';
import { Select, useChannelOptions } from '../components/pickers';

const REPEAT_LABEL: Record<string, string> = { none: 'مرة واحدة', daily: 'يوميًا', weekly: 'أسبوعيًا' };

export function Scheduled() {
  const { data, isLoading } = useScheduled();
  const save = useSaveScheduled();
  const del = useDeleteScheduled();
  const channels = useChannelOptions(['text', 'announcement']);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [runAt, setRunAt] = useState('');
  const [repeat, setRepeat] = useState('none');

  function add() {
    if (!channelId) return toast('اختر قناة', 'err');
    if (!content.trim()) return toast('أدخل نص الرسالة', 'err');
    const when = new Date(runAt);
    if (Number.isNaN(when.getTime())) return toast('اختر وقتًا صحيحًا', 'err');
    save.mutate(
      { channelId, content: content.trim(), runAt: when.toISOString(), repeat },
      { onSuccess: () => { toast('تمت الجدولة'); setContent(''); setRunAt(''); }, onError: () => toast('فشل', 'err') },
    );
  }

  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <p className="page-intro" style={{ margin: 0 }}>جدوِل رسائل تُرسل تلقائيًا في وقت محدد، مرة واحدة أو متكررة.</p>

      <div className="card card-pad">
        <div className="card-hd"><div className="card-title"><Icon name="clock" /> جدولة رسالة</div></div>
        <div className="field-row">
          <div className="field" style={{ flex: 1 }}><label>القناة</label><Select value={channelId} onChange={setChannelId} options={channels} placeholder="اختر قناة" /></div>
          <div className="field" style={{ flex: '0 0 150px' }}>
            <label>التكرار</label>
            <select className="select" value={repeat} onChange={(e) => setRepeat(e.target.value)}>
              <option value="none">مرة واحدة</option>
              <option value="daily">يوميًا</option>
              <option value="weekly">أسبوعيًا</option>
            </select>
          </div>
        </div>
        <div className="field"><label>الوقت</label><input className="input" type="datetime-local" value={runAt} onChange={(e) => setRunAt(e.target.value)} /></div>
        <div className="field" style={{ marginBottom: 14 }}><label>نص الرسالة</label><textarea className="textarea" value={content} onChange={(e) => setContent(e.target.value)} /></div>
        <button className="btn btn-primary" disabled={save.isPending} onClick={add}><Icon name="plus" /> جدولة</button>
      </div>

      {isLoading ? (
        <SkeletonRows rows={4} />
      ) : !data || data.items.length === 0 ? (
        <div className="card"><EmptyState icon="clock" title="لا رسائل مجدولة" sub="أضف واحدة من الأعلى." /></div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>الرسالة</th><th>الوقت</th><th>التكرار</th><th>مفعّل</th><th></th></tr></thead>
              <tbody>
                {data.items.map((it) => (
                  <tr key={it.id}>
                    <td style={{ maxWidth: 280 }}>{it.content}</td>
                    <td className="muted" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{dateTime(it.runAt)}</td>
                    <td><span className="badge badge-warn">{REPEAT_LABEL[it.repeat] ?? it.repeat}</span></td>
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
