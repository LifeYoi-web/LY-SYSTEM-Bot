import { useState, type KeyboardEvent, type CSSProperties } from 'react';
import { Icon } from '../lib/icons';
import { useChannels, useRoles } from '../lib/hooks';

export interface Option {
  id: string;
  label: string;
  color?: string | null;
}

/* Single select with a placeholder + clear. */
export function Select({
  value,
  onChange,
  options,
  placeholder = 'بدون',
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  options: Option[];
  placeholder?: string;
}) {
  return (
    <select className="select" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">— {placeholder} —</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/* Selected items shown as removable chips + an add-dropdown of the remainder. */
export function MultiSelect({
  value,
  onChange,
  options,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  options: Option[];
}) {
  const byId = new Map(options.map((o) => [o.id, o]));
  const remaining = options.filter((o) => !value.includes(o.id));
  return (
    <div className="stack" style={{ gap: 10 }}>
      {value.length > 0 && (
        <div className="chips">
          {value.map((id) => {
            const o = byId.get(id);
            return (
              <span className="chip" key={id} style={o?.color ? ({ ['--rc' as string]: o.color } as CSSProperties) : undefined}>
                {o?.color && <span className="dot" style={{ width: 8, height: 8, borderRadius: '50%', background: o.color }} />}
                {o?.label ?? id}
                <button onClick={() => onChange(value.filter((x) => x !== id))} aria-label="إزالة">
                  <Icon name="x" />
                </button>
              </span>
            );
          })}
        </div>
      )}
      {remaining.length > 0 && (
        <select
          className="select"
          value=""
          onChange={(e) => {
            if (e.target.value) onChange([...value, e.target.value]);
          }}
        >
          <option value="">+ إضافة...</option>
          {remaining.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

/* Free-text tag input (Enter / comma to add). */
export function ChipsInput({
  value,
  onChange,
  placeholder = 'أضف ثم اضغط Enter',
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState('');
  function add() {
    const t = text.trim().toLowerCase();
    if (t && !value.includes(t)) onChange([...value, t]);
    setText('');
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add();
    } else if (e.key === 'Backspace' && !text && value.length) {
      onChange(value.slice(0, -1));
    }
  }
  return (
    <div>
      <input className="input" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} placeholder={placeholder} />
      {value.length > 0 && (
        <div className="chips" style={{ marginTop: 10 }}>
          {value.map((w) => (
            <span className="chip" key={w}>
              {w}
              <button onClick={() => onChange(value.filter((x) => x !== w))} aria-label="إزالة">
                <Icon name="x" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* Convenience wrappers wired to the server's channel/role lists. */
export function useChannelOptions(kinds?: string[]): Option[] {
  const { data } = useChannels();
  return (data?.channels ?? [])
    .filter((c) => (kinds ? kinds.includes(c.kind) : true))
    .map((c) => ({ id: c.id, label: `# ${c.name}` }));
}
export function useRoleOptions(): Option[] {
  const { data } = useRoles();
  return (data?.roles ?? []).map((r) => ({ id: r.id, label: r.name, color: r.color }));
}
