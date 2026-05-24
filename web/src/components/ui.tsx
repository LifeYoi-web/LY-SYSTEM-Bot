import { useEffect, useSyncExternalStore, type ReactNode, type CSSProperties } from 'react';
import { Icon, type IconName } from '../lib/icons';

/* ----------------------------------------------------------------- format */
export const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString('en-US');

/** NaN-safe integer clamp for number <input> handlers (empty/invalid → min). */
export const clampInt = (raw: unknown, min: number, max: number): number => {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : min;
};

const rtf = new Intl.RelativeTimeFormat('ar', { numeric: 'auto' });
export function relTime(iso: string | number | Date): string {
  const d = new Date(iso).getTime();
  const diff = d - Date.now();
  const abs = Math.abs(diff);
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (abs < min) return 'الآن';
  if (abs < hr) return rtf.format(Math.round(diff / min), 'minute');
  if (abs < day) return rtf.format(Math.round(diff / hr), 'hour');
  if (abs < 30 * day) return rtf.format(Math.round(diff / day), 'day');
  return new Date(iso).toLocaleDateString('ar');
}

export function dateTime(iso: string | number | Date): string {
  return new Date(iso).toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short' });
}

/* ----------------------------------------------------------------- toasts */
interface ToastItem {
  id: number;
  type: 'ok' | 'err';
  msg: string;
}
let items: ToastItem[] = [];
const subs = new Set<() => void>();
let seq = 0;
function emit() {
  subs.forEach((f) => f());
}
export function toast(msg: string, type: 'ok' | 'err' = 'ok') {
  const t = { id: ++seq, type, msg };
  items = [...items, t];
  emit();
  setTimeout(() => {
    items = items.filter((x) => x.id !== t.id);
    emit();
  }, 3400);
}
export function ToastHost() {
  const list = useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => items,
    () => items,
  );
  return (
    <div className="toast-host" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.type}`} role="status">
          <Icon name={t.type === 'ok' ? 'check-circle' : 'alert-triangle'} />
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------- modal */
export function Modal({
  title,
  sub,
  onClose,
  children,
  footer,
}: {
  title: string;
  sub?: string;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="overlay" onClick={onClose} />
      <div className="modal-card" style={{ position: 'relative' }}>
        <h3>{title}</h3>
        {sub && <p className="sub">{sub}</p>}
        {children}
        {footer && <div className="modal-actions">{footer}</div>}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- drawer */
export function Drawer({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="drawer" role="dialog" aria-modal="true">
      <div className="overlay" onClick={onClose} />
      <div className="drawer-panel">{children}</div>
    </div>
  );
}

/* ----------------------------------------------------------------- switch */
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <label className="switch" aria-label={label}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track">
        <span className="thumb" />
      </span>
    </label>
  );
}

/* ----------------------------------------------------------------- skeleton + empty */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={`sk ${className ?? ''}`} style={style} />;
}
export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="card-pad">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="sk-line" />
      ))}
    </div>
  );
}
export function EmptyState({ icon = 'sparkles', title, sub }: { icon?: IconName; title: string; sub?: string }) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <div className="et">{title}</div>
      {sub && <div className="es">{sub}</div>}
    </div>
  );
}

export function CopyButton({ value, title = 'نسخ' }: { value: string; title?: string }) {
  return (
    <button
      className="icon-btn"
      title={title}
      onClick={() => {
        navigator.clipboard?.writeText(value).then(
          () => toast('تم النسخ'),
          () => toast('تعذّر النسخ', 'err'),
        );
      }}
    >
      <Icon name="copy" />
    </button>
  );
}

export function Loading({ minHeight = 240 }: { minHeight?: number }) {
  return (
    <div className="center-screen" style={{ minHeight }}>
      <div className="spinner" />
    </div>
  );
}
