import { useState, type CSSProperties } from 'react';
import { useMembers, useMemberDetail } from '../lib/hooks';
import type { Member } from '../lib/types';
import { Icon } from '../lib/icons';
import { Drawer, EmptyState, SkeletonRows, fmt, relTime, dateTime, CopyButton } from '../components/ui';
import { ActionModal } from '../components/ActionModal';

const PAGE = 50;
const FILTERS: { k: 'all' | 'humans' | 'bots'; label: string }[] = [
  { k: 'all', label: 'الكل' },
  { k: 'humans', label: 'الأعضاء' },
  { k: 'bots', label: 'البوتات' },
];
const TYPE_LABEL: Record<string, string> = { ban: 'حظر', kick: 'طرد', mute: 'كتم', warn: 'تحذير' };

function RolePills({ member }: { member: Member }) {
  if (member.roles.length === 0) return <span className="faint" style={{ fontSize: 12 }}>—</span>;
  return (
    <div className="row wrap" style={{ gap: 5 }}>
      {member.roles.slice(0, 2).map((r) => (
        <span className="role-pill" key={r.id} style={{ ['--rc' as string]: r.color ?? 'var(--muted)' } as CSSProperties}>
          <span className="dot" />
          {r.name}
        </span>
      ))}
      {member.roleCount > 2 && <span className="role-pill">+{member.roleCount - 2}</span>}
    </div>
  );
}

function MemberDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useMemberDetail(id);
  const [action, setAction] = useState<{ initial: 'warn' | 'mute' | 'kick' | 'ban' } | null>(null);

  return (
    <Drawer onClose={onClose}>
      <div className="drawer-hd">
        <button className="icon-btn" onClick={onClose} aria-label="إغلاق">
          <Icon name="x" />
        </button>
        <span className="card-title">ملف العضو</span>
      </div>
      <div className="drawer-body">
        {isLoading || !data ? (
          <SkeletonRows rows={5} />
        ) : (
          <>
            <div style={{ textAlign: 'center', marginBottom: 22 }}>
              {data.member.avatarUrl ? (
                <img className="avatar avatar-lg avatar-ring" src={data.member.avatarUrl} alt="" style={{ margin: '0 auto' }} />
              ) : (
                <div className="avatar avatar-lg" style={{ margin: '0 auto' }} />
              )}
              <h3 style={{ marginTop: 14 }}>{data.member.displayName}</h3>
              <div className="row" style={{ justifyContent: 'center', gap: 6 }}>
                <span className="mono">{data.member.id}</span>
                <CopyButton value={data.member.id} />
                {data.member.isBot && <span className="tag-bot">BOT</span>}
              </div>
            </div>

            <div className="grid grid-2" style={{ gap: 10, marginBottom: 18 }}>
              <Info label="انضمّ" value={data.member.joinedAt ? relTime(data.member.joinedAt) : '—'} />
              <Info label="أنشأ حسابه" value={data.member.createdAt ? dateTime(data.member.createdAt) : '—'} />
            </div>

            {data.member.roles.length > 0 && (
              <div className="field">
                <label>الرتب ({data.member.roleCount})</label>
                <RolePills member={data.member} />
              </div>
            )}

            <div className="field">
              <label>سجل العقوبات ({data.stats.total})</label>
              {data.cases.length === 0 ? (
                <EmptyState icon="shield-check" title="سجلّ نظيف" />
              ) : (
                <div className="feed">
                  {data.cases.slice(0, 8).map((c) => (
                    <div className="feed-item" key={c.id}>
                      <span className={`badge badge-${c.type}`}>{TYPE_LABEL[c.type] ?? c.type}</span>
                      <div className="feed-body">
                        <div className="ft">{c.reason ?? '—'}</div>
                        <div className="fs">{relTime(c.createdAt)}</div>
                      </div>
                      {!c.active && <span className="badge badge-lifted">مرفوعة</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="row wrap" style={{ gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setAction({ initial: 'warn' })}>
                <Icon name="alert-triangle" /> تحذير
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setAction({ initial: 'mute' })} disabled={data.member.isBot}>
                <Icon name="volume-x" /> كتم
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => setAction({ initial: 'kick' })} disabled={data.member.isBot}>
                <Icon name="user-x" /> طرد
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => setAction({ initial: 'ban' })}>
                <Icon name="ban" /> حظر
              </button>
            </div>

            {action && (
              <ActionModal
                member={{ id: data.member.id, displayName: data.member.displayName, isBot: data.member.isBot }}
                initialKind={action.initial}
                onClose={() => setAction(null)}
              />
            )}
          </>
        )}
      </div>
    </Drawer>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="card card-pad" style={{ padding: '12px 14px' }}>
      <div className="fs faint">{label}</div>
      <div style={{ fontWeight: 700, marginTop: 3, fontSize: 13.5 }}>{value}</div>
    </div>
  );
}

export function Members() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'humans' | 'bots'>('all');
  const [offset, setOffset] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [quick, setQuick] = useState<{ member: Member; initial: 'warn' | 'mute' | 'kick' | 'ban' } | null>(null);

  const { data, isLoading } = useMembers({ search, filter, limit: PAGE, offset });

  function onSearch(v: string) {
    setSearch(v);
    setOffset(0);
  }
  function onFilter(f: 'all' | 'humans' | 'bots') {
    setFilter(f);
    setOffset(0);
  }

  const total = data?.total ?? 0;

  return (
    <div className="stack">
      <div className="between wrap">
        <div className="search-wrap" style={{ flex: 1, minWidth: 220 }}>
          <Icon name="search" />
          <input className="input" value={search} onChange={(e) => onSearch(e.target.value)} placeholder="ابحث بالاسم أو الـ ID..." />
        </div>
        <div className="seg">
          {FILTERS.map((f) => (
            <button key={f.k} className={filter === f.k ? 'on' : ''} onClick={() => onFilter(f.k)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        {isLoading ? (
          <SkeletonRows rows={8} />
        ) : !data || data.members.length === 0 ? (
          <EmptyState icon="users" title="لا أعضاء مطابقين" sub="جرّب تعديل البحث أو الفلتر." />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>العضو</th>
                  <th>الرتب</th>
                  <th>انضمّ</th>
                  <th style={{ textAlign: 'end' }}>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {data.members.map((m) => (
                  <tr key={m.id} className="clickable" onClick={() => setOpenId(m.id)}>
                    <td>
                      <div className="user-cell">
                        {m.avatarUrl ? <img className="avatar" src={m.avatarUrl} alt="" /> : <div className="avatar" />}
                        <div style={{ minWidth: 0 }}>
                          <div className="uc-name">
                            {m.displayName} {m.isBot && <span className="tag-bot">BOT</span>}
                          </div>
                          <div className="uc-sub">@{m.username}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <RolePills member={m} />
                    </td>
                    <td className="muted" style={{ fontSize: 13 }}>{m.joinedAt ? relTime(m.joinedAt) : '—'}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="cell-actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => setQuick({ member: m, initial: 'warn' })}>
                          تحذير
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => setQuick({ member: m, initial: 'ban' })}>
                          حظر
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {total > 0 && (
        <div className="between">
          <span className="muted" style={{ fontSize: 13 }}>
            {fmt(total)} عضو • عرض {offset + 1}–{Math.min(offset + PAGE, total)}
          </span>
          <div className="row">
            <button className="btn btn-ghost btn-sm" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(o - PAGE, 0))}>
              <Icon name="chevron-right" /> السابق
            </button>
            <button className="btn btn-ghost btn-sm" disabled={offset + PAGE >= total} onClick={() => setOffset((o) => o + PAGE)}>
              التالي <Icon name="chevron-left" />
            </button>
          </div>
        </div>
      )}

      {openId && <MemberDrawer id={openId} onClose={() => setOpenId(null)} />}
      {quick && (
        <ActionModal
          member={{ id: quick.member.id, displayName: quick.member.displayName, isBot: quick.member.isBot }}
          initialKind={quick.initial}
          onClose={() => setQuick(null)}
        />
      )}
    </div>
  );
}
