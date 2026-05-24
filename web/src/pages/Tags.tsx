import { useState } from 'react';
import { useTags, useSaveTag, useDeleteTag } from '../lib/community';
import { Icon } from '../lib/icons';
import { SkeletonRows, EmptyState, toast, fmt } from '../components/ui';

export function Tags() {
  const { data, isLoading } = useTags();
  const save = useSaveTag();
  const del = useDeleteTag();
  const [name, setName] = useState('');
  const [content, setContent] = useState('');

  function add() {
    if (!name.trim() || !content.trim()) return toast('أدخل الاسم والمحتوى', 'err');
    save.mutate(
      { name: name.trim(), content: content.trim() },
      {
        onSuccess: () => { toast('تم حفظ التاج'); setName(''); setContent(''); },
        onError: () => toast('الاسم مستخدم أو حصل خطأ', 'err'),
      },
    );
  }

  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <p className="page-intro" style={{ margin: 0 }}>محتوى محفوظ يستدعيه الأعضاء بـ <code>/tag الاسم</code> — مثالي للقوانين والروابط والشروحات.</p>
      <div className="card card-pad">
        <div className="card-hd"><div className="card-title"><Icon name="bot" /> تاج جديد</div></div>
        <div className="field"><label>الاسم</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="rules" /></div>
        <div className="field" style={{ marginBottom: 14 }}><label>المحتوى</label><textarea className="textarea" value={content} onChange={(e) => setContent(e.target.value)} /></div>
        <button className="btn btn-primary" disabled={save.isPending} onClick={add}><Icon name="plus" /> إضافة</button>
      </div>
      {isLoading ? (
        <SkeletonRows rows={4} />
      ) : !data || data.tags.length === 0 ? (
        <div className="card"><EmptyState icon="bot" title="لا تاجات بعد" sub="أضف أول تاج من الأعلى." /></div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>الاسم</th><th>المحتوى</th><th>الاستخدام</th><th></th></tr></thead>
              <tbody>
                {data.tags.map((t) => (
                  <tr key={t.id}>
                    <td className="mono">/{t.name}</td>
                    <td style={{ maxWidth: 360, color: 'var(--muted)' }}>{t.content}</td>
                    <td className="tnum">{fmt(t.uses)}</td>
                    <td><button className="icon-btn" onClick={() => del.mutate(t.id)} aria-label="حذف"><Icon name="trash" /></button></td>
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
