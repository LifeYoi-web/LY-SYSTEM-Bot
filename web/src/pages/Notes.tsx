import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiPost, apiDelete } from '../lib/api';
import { Icon } from '../lib/icons';
import { EmptyState, SkeletonRows, toast, relTime } from '../components/ui';

interface MemberNote {
  id: string;
  guildId: string;
  userId: string;
  authorId: string;
  content: string;
  createdAt: string;
}

function useNotes(userId: string | null) {
  return useQuery<{ notes: MemberNote[] }>({
    queryKey: ['notes', userId ?? 'all'],
    queryFn: () => api(`/notes${userId ? `?userId=${encodeURIComponent(userId)}` : ''}`),
  });
}

export function Notes() {
  const [userId, setUserId] = useState('');
  const [search, setSearch] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const { data, isLoading } = useNotes(search);
  const qc = useQueryClient();
  const add = useMutation({
    mutationFn: (b: { userId: string; content: string }) => apiPost('/notes', b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  });
  const del = useMutation({
    mutationFn: (id: string) => apiDelete(`/notes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  });

  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <div className="card card-pad">
        <div className="card-hd"><div className="card-title"><Icon name="file-text" /> بحث عن ملاحظات عضو</div></div>
        <div className="row" style={{ gap: 8 }}>
          <input className="input" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="معرّف العضو (User ID)" style={{ flex: 1 }} />
          <button className="btn btn-primary" onClick={() => setSearch(userId.trim() || null)}>بحث</button>
          <button className="btn btn-ghost" onClick={() => { setUserId(''); setSearch(null); }}>الكل</button>
        </div>
      </div>

      <div className="card card-pad">
        <div className="card-hd"><div className="card-title"><Icon name="plus" /> إضافة ملاحظة</div></div>
        <div className="field"><label>معرّف العضو</label><input className="input" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="123456789012345678" /></div>
        <div className="field" style={{ marginBottom: 8 }}><label>الملاحظة</label><textarea className="textarea" value={content} onChange={(e) => setContent(e.target.value)} maxLength={1000} placeholder="ملاحظة خاصة للطاقم فقط..." /></div>
        <button className="btn btn-primary" disabled={add.isPending || !userId.trim() || !content.trim()} onClick={() =>
          add.mutate({ userId: userId.trim(), content: content.trim() }, {
            onSuccess: () => { setContent(''); toast('تمت الإضافة'); },
            onError: () => toast('فشل', 'err'),
          })
        }><Icon name="check" /> إضافة</button>
      </div>

      <div className="card card-pad">
        <div className="card-hd"><div className="card-title"><Icon name="scroll" /> الملاحظات ({data?.notes.length ?? 0})</div></div>
        {isLoading ? <SkeletonRows rows={4} /> : !data || data.notes.length === 0 ? (
          <EmptyState icon="file-text" title="لا توجد ملاحظات" sub={search ? 'هذا العضو ما عليه ملاحظات.' : 'استخدم النموذج أعلاه أو `/note add`.'} />
        ) : (
          <div className="feed">
            {data.notes.map((n) => (
              <div className="feed-item" key={n.id}>
                <div className="feed-ico"><Icon name="file-text" /></div>
                <div className="feed-body">
                  <div className="ft">على <span className="mono">{n.userId}</span> · كتبها <span className="mono">{n.authorId}</span></div>
                  <div className="fs">{n.content}</div>
                  <div className="fs" style={{ opacity: 0.7 }}>{relTime(n.createdAt)} · <span className="mono">{n.id}</span></div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => window.confirm('حذف الملاحظة؟') && del.mutate(n.id, { onSuccess: () => toast('تم الحذف'), onError: () => toast('فشل', 'err') })}><Icon name="trash" /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
