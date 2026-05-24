import { useState } from 'react';
import { useLogs } from '../lib/hooks';
import { Icon } from '../lib/icons';
import { EmptyState, SkeletonRows, relTime, dateTime, fmt } from '../components/ui';
import { logMeta, logText } from '../lib/logmeta';

const TYPE_OPTIONS: { v: string; label: string }[] = [
  { v: '', label: 'كل الأحداث' },
  { v: 'member_join', label: 'انضمام عضو' },
  { v: 'member_leave', label: 'مغادرة عضو' },
  { v: 'message_delete', label: 'حذف رسائل' },
  { v: 'mod_ban', label: 'حظر' },
  { v: 'mod_kick', label: 'طرد' },
  { v: 'mod_mute', label: 'كتم' },
  { v: 'mod_warn', label: 'تحذير' },
  { v: 'mod_unban', label: 'فك حظر' },
  { v: 'automod_banned_word', label: 'حماية: كلمة محظورة' },
  { v: 'automod_invite', label: 'حماية: روابط دعوات' },
  { v: 'automod_link', label: 'حماية: روابط' },
  { v: 'automod_spam', label: 'حماية: سبام' },
];

export function Logs() {
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useLogs({ type: type || undefined, page, limit: 30 });

  return (
    <div className="stack">
      <div className="between wrap">
        <p className="page-intro" style={{ margin: 0 }}>
          سجلّ كامل لكل ما يحدث في السيرفر — قابل للفلترة.
        </p>
        <select
          className="select"
          style={{ maxWidth: 240 }}
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(1);
          }}
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.v} value={o.v}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="card card-pad">
        {isLoading ? (
          <SkeletonRows rows={8} />
        ) : !data || data.logs.length === 0 ? (
          <EmptyState icon="scroll" title="لا أحداث" sub="لا توجد سجلّات مطابقة للفلتر الحالي." />
        ) : (
          <div className="feed">
            {data.logs.map((log) => {
              const m = logMeta(log.type);
              return (
                <div className="feed-item" key={log.id}>
                  <div className="feed-ico">
                    <Icon name={m.icon} />
                  </div>
                  <div className="feed-body">
                    <div className="ft">{logText(log)}</div>
                    <div className="fs" title={dateTime(log.createdAt)}>
                      {relTime(log.createdAt)}
                    </div>
                  </div>
                  <span className={`badge ${m.cls}`}>{m.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {data && data.pages > 1 && (
        <div className="between">
          <span className="muted" style={{ fontSize: 13 }}>
            صفحة {fmt(data.page)} من {fmt(data.pages)} • {fmt(data.total)} حدث
          </span>
          <div className="row">
            <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(p - 1, 1))}>
              <Icon name="chevron-right" /> السابق
            </button>
            <button className="btn btn-ghost btn-sm" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>
              التالي <Icon name="chevron-left" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
