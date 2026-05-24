import type { IconName } from './icons';
import type { LogEntry } from './types';

export interface LogMeta {
  icon: IconName;
  label: string;
  cls: string;
}

const MAP: Record<string, LogMeta> = {
  mod_ban: { icon: 'ban', label: 'حظر', cls: 'badge-ban' },
  mod_kick: { icon: 'user-x', label: 'طرد', cls: 'badge-kick' },
  mod_mute: { icon: 'volume-x', label: 'كتم', cls: 'badge-mute' },
  mod_warn: { icon: 'alert-triangle', label: 'تحذير', cls: 'badge-warn' },
  mod_unban: { icon: 'check-circle', label: 'فك حظر', cls: 'badge-active' },
  member_join: { icon: 'user-plus', label: 'انضمام', cls: 'badge-active' },
  member_leave: { icon: 'user-minus', label: 'مغادرة', cls: 'badge-lifted' },
  message_delete: { icon: 'trash', label: 'حذف رسالة', cls: 'badge-lifted' },
};

export function logMeta(type: string): LogMeta {
  if (MAP[type]) return MAP[type];
  if (type.startsWith('automod_')) return { icon: 'shield-alert', label: 'حماية تلقائية', cls: 'badge-warn' };
  if (type.startsWith('mod_lift')) return { icon: 'rotate-ccw', label: 'رفع عقوبة', cls: 'badge-active' };
  return { icon: 'scroll', label: type, cls: 'badge-lifted' };
}

const short = (id: unknown) => (typeof id === 'string' && id.length > 6 ? `…${id.slice(-4)}` : String(id ?? ''));

export function logText(log: LogEntry): string {
  const d = (log.data ?? {}) as Record<string, unknown>;
  const who = (d.username as string) || short(d.userId ?? d.targetUserId);
  switch (true) {
    case log.type === 'member_join':
      return `انضمّ ${who} للسيرفر`;
    case log.type === 'member_leave':
      return `غادر ${who} السيرفر`;
    case log.type === 'message_delete':
      return `حُذفت رسالة لـ ${who}`;
    case log.type.startsWith('automod_'):
      return `أوقفت الحماية مخالفة من ${who} (${(d.action as string) ?? 'delete'})`;
    case log.type.startsWith('mod_lift'):
      return `رُفعت عقوبة عن عضو`;
    case log.type.startsWith('mod_'): {
      const reason = (d.reason as string) || 'بدون سبب';
      return `${logMeta(log.type).label} — ${reason}`;
    }
    default:
      return log.type;
  }
}
