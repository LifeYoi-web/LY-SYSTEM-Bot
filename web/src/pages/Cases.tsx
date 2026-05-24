import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiDelete } from '../lib/api';

interface ModCase {
  id: string;
  targetUserId: string;
  moderatorId: string;
  type: string;
  reason: string | null;
  createdAt: string;
  expiresAt: string | null;
  active: boolean;
}
const typeLabels: Record<string, string> = { ban: 'حظر', kick: 'طرد', mute: 'كتم', warn: 'تحذير' };

export function Cases() {
  const [userId, setUserId] = useState('');
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<ModCase[]>({
    queryKey: ['cases', userId],
    queryFn: () => api(`/moderation/cases${userId ? `?userId=${encodeURIComponent(userId)}` : ''}`),
  });

  const lift = useMutation({
    mutationFn: (id: string) => apiDelete(`/moderation/cases/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cases'] }),
  });

  return (
    <>
      <div className="search-wrap">
        <span className="ico">🔍</span>
        <input
          className="input"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="فلترة بمعرّف العضو (اختياري)..."
        />
      </div>

      <div className="card">
        {isLoading ? (
          <div className="center-screen" style={{ minHeight: 220 }}><div className="spinner" /></div>
        ) : !data || data.length === 0 ? (
          <div className="empty">ما فيه عقوبات مسجّلة</div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>النوع</th><th>العضو</th><th>السبب</th><th>التاريخ</th><th>الحالة</th><th></th></tr>
              </thead>
              <tbody>
                {data.map((c) => (
                  <tr key={c.id}>
                    <td><span className={`badge badge-${c.type}`}>{typeLabels[c.type] ?? c.type}</span></td>
                    <td className="mono">{c.targetUserId}</td>
                    <td>{c.reason ?? '—'}</td>
                    <td className="muted">{new Date(c.createdAt).toLocaleString('ar')}</td>
                    <td><span className={`badge ${c.active ? 'badge-active' : 'badge-lifted'}`}>{c.active ? 'فعّالة' : 'مرفوعة'}</span></td>
                    <td>
                      {c.active && (c.type === 'ban' || c.type === 'mute') && (
                        <button className="btn btn-sm btn-ghost" disabled={lift.isPending} onClick={() => lift.mutate(c.id)}>
                          رفع العقوبة
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
