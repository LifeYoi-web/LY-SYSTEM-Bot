import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiPost } from '../lib/api';

interface Member {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isBot: boolean;
}
interface MembersResponse {
  members: Member[];
  total: number;
}
type ActionKind = 'warn' | 'mute' | 'kick' | 'ban';
const labels: Record<ActionKind, string> = { warn: 'تحذير', mute: 'كتم', kick: 'طرد', ban: 'حظر' };

export function Members() {
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState<Member | null>(null);
  const [kind, setKind] = useState<ActionKind>('warn');
  const [reason, setReason] = useState('');
  const [minutes, setMinutes] = useState(10);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<MembersResponse>({
    queryKey: ['members', search],
    queryFn: () => api(`/members?search=${encodeURIComponent(search)}`),
  });

  const mutation = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { userId: target!.id, reason };
      if (kind === 'mute') body.seconds = Math.max(1, Math.round(minutes * 60));
      return apiPost(`/moderation/${kind}`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cases'] });
      setTarget(null);
    },
  });

  function open(m: Member, k: ActionKind) {
    setTarget(m);
    setKind(k);
    setReason('');
    setMinutes(10);
  }

  return (
    <>
      <div className="search-wrap">
        <span className="ico">🔍</span>
        <input
          className="input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث بالاسم أو الـ ID..."
        />
      </div>

      <div className="card">
        {isLoading ? (
          <div className="center-screen" style={{ minHeight: 220 }}><div className="spinner" /></div>
        ) : !data || data.members.length === 0 ? (
          <div className="empty">ما فيه أعضاء مطابقين</div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>العضو</th><th>المعرّف</th><th style={{ textAlign: 'end' }}>إجراءات</th></tr>
              </thead>
              <tbody>
                {data.members.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <div className="user-cell">
                        {m.avatarUrl ? <img className="avatar" src={m.avatarUrl} alt="" /> : <div className="avatar" />}
                        <span>{m.displayName}</span>
                        {m.isBot && <span className="tag-bot">BOT</span>}
                      </div>
                    </td>
                    <td className="mono">{m.id}</td>
                    <td style={{ textAlign: 'end', whiteSpace: 'nowrap' }}>
                      {(['warn', 'mute', 'kick', 'ban'] as ActionKind[]).map((k) => (
                        <button
                          key={k}
                          className={`btn btn-sm ${k === 'ban' ? 'btn-danger' : 'btn-ghost'}`}
                          style={{ marginInlineStart: 6 }}
                          onClick={() => open(m, k)}
                          disabled={m.isBot && k !== 'ban'}
                        >
                          {labels[k]}
                        </button>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {data && <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>{data.total.toLocaleString('ar')} عضو</p>}

      {target && (
        <div className="modal-overlay" onClick={() => setTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{labels[kind]} — {target.displayName}</h3>
            <p className="sub">راح يتسجّل الإجراء في سجل العقوبات تلقائيًا.</p>
            <div className="field">
              <label>السبب</label>
              <textarea
                className="textarea"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="اكتب سبب الإجراء..."
              />
            </div>
            {kind === 'mute' && (
              <div className="field">
                <label>مدة الكتم (بالدقائق)</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                />
              </div>
            )}
            <div className="modal-actions">
              <button
                className={`btn ${kind === 'ban' ? 'btn-danger' : 'btn-primary'}`}
                disabled={mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? '...' : `تأكيد ${labels[kind]}`}
              </button>
              <button className="btn btn-ghost" onClick={() => setTarget(null)}>إلغاء</button>
            </div>
            {mutation.isError && <p className="err-text">فشل تنفيذ الإجراء — تأكد إن للبوت صلاحية كافية.</p>}
          </div>
        </div>
      )}
    </>
  );
}
