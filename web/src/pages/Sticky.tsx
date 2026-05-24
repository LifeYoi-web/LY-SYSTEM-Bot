import { useState } from 'react';
import { useSticky, useSaveSticky, useDeleteSticky } from '../lib/community';
import { Icon } from '../lib/icons';
import { SkeletonRows, EmptyState, toast } from '../components/ui';
import { Select, useChannelOptions } from '../components/pickers';

export function Sticky() {
  const { data, isLoading } = useSticky();
  const save = useSaveSticky();
  const del = useDeleteSticky();
  const channels = useChannelOptions(['text']);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const channelName = (id: string) => channels.find((c) => c.id === id)?.label ?? `# ${id}`;

  function add() {
    if (!channelId) return toast('اختر قناة', 'err');
    if (!content.trim()) return toast('اكتب محتوى الرسالة', 'err');
    save.mutate(
      { channelId, content: content.trim() },
      { onSuccess: () => { toast('تم تثبيت الرسالة'); setContent(''); }, onError: () => toast('فشل', 'err') },
    );
  }

  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <p className="page-intro" style={{ margin: 0 }}>رسالة تبقى دائمًا في أسفل القناة، تُعاد تلقائيًا بعد رسائل الأعضاء.</p>
      <div className="card card-pad">
        <div className="card-hd"><div className="card-title"><Icon name="megaphone" /> رسالة مثبّتة جديدة</div></div>
        <div className="field"><label>القناة</label><Select value={channelId} onChange={setChannelId} options={channels} placeholder="اختر قناة" /></div>
        <div className="field" style={{ marginBottom: 14 }}><label>المحتوى</label><textarea className="textarea" value={content} onChange={(e) => setContent(e.target.value)} /></div>
        <button className="btn btn-primary" disabled={save.isPending} onClick={add}><Icon name="check" /> تثبيت</button>
      </div>
      {isLoading ? (
        <SkeletonRows rows={3} />
      ) : !data || data.items.length === 0 ? (
        <div className="card"><EmptyState icon="megaphone" title="لا رسائل مثبّتة" /></div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>القناة</th><th>المحتوى</th><th></th></tr></thead>
              <tbody>
                {data.items.map((s) => (
                  <tr key={s.channelId}>
                    <td>{channelName(s.channelId)}</td>
                    <td style={{ maxWidth: 380, color: 'var(--muted)' }}>{s.content}</td>
                    <td><button className="icon-btn" onClick={() => del.mutate(s.channelId, { onSuccess: () => toast('أُزيلت') })} aria-label="حذف"><Icon name="trash" /></button></td>
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
