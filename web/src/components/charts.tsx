import { useId, useState, type CSSProperties } from 'react';

const fmt = (n: number) => n.toLocaleString('en-US');

const tip: CSSProperties = {
  position: 'absolute',
  top: 0,
  transform: 'translateX(-50%)',
  background: 'var(--elevated)',
  border: '1px solid var(--border-strong)',
  borderRadius: 10,
  padding: '8px 11px',
  fontSize: 12.5,
  fontWeight: 600,
  pointerEvents: 'none',
  whiteSpace: 'nowrap',
  boxShadow: 'var(--shadow)',
  zIndex: 2,
};

export interface Series {
  name: string;
  color: string;
  values: number[];
}

export function AreaChart({
  series,
  labels,
  height = 220,
}: {
  series: Series[];
  labels: string[];
  height?: number;
}) {
  const gid = useId();
  const [hover, setHover] = useState<number | null>(null);
  const W = 740;
  const H = height;
  const padL = 6;
  const padR = 6;
  const padT = 16;
  const padB = 26;
  const n = labels.length;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const x = (i: number) => (n <= 1 ? padL + innerW / 2 : padL + (i / (n - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / max) * innerH;
  const line = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
  const area = (vals: number[]) => `${line(vals)} L${x(n - 1)},${padT + innerH} L${x(0)},${padT + innerH} Z`;
  const step = Math.max(1, Math.ceil(n / 7));
  // Guard against a stale hover index after the data array shrinks (e.g. range toggle).
  const safeHover = hover != null && hover < n ? hover : null;

  return (
    <div className="chart" style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`رسم بياني زمني: ${series.map((s) => s.name).join('، ')}`}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={series[0]?.color ?? 'var(--accent)'} stopOpacity="0.28" />
            <stop offset="100%" stopColor={series[0]?.color ?? 'var(--accent)'} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} className="grid-line" x1={padL} x2={W - padR} y1={padT + innerH - f * innerH} y2={padT + innerH - f * innerH} />
        ))}
        {series.map((s, si) => (
          <g key={s.name}>
            {si === 0 && <path d={area(s.values)} fill={`url(#${gid})`} />}
            <path className={`area-line ${si > 0 ? 'secondary' : ''}`} style={{ stroke: s.color }} d={line(s.values)} />
          </g>
        ))}
        {labels.map((l, i) =>
          i % step === 0 || i === n - 1 ? (
            <text key={i} className="axis-label" x={x(i)} y={H - 8} textAnchor="middle">
              {l}
            </text>
          ) : null,
        )}
        {safeHover != null && <line x1={x(safeHover)} x2={x(safeHover)} y1={padT} y2={padT + innerH} style={{ stroke: 'var(--accent-line)' }} />}
        {safeHover != null &&
          series.map((s) => <circle key={s.name} className="dot" style={{ fill: s.color }} cx={x(safeHover)} cy={y(s.values[safeHover] ?? 0)} r={4} />)}
        {labels.map((_, i) => {
          const w = innerW / Math.max(n, 1);
          return (
            <rect
              key={i}
              x={x(i) - w / 2}
              y={padT}
              width={w}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}
      </svg>
      {safeHover != null && (
        <div style={{ ...tip, left: `${(x(safeHover) / W) * 100}%` }}>
          <b>{labels[safeHover]}</b>
          {series.map((s) => (
            <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: s.color, display: 'inline-block' }} />
              {s.name}: <span className="tnum">{fmt(s.values[safeHover] ?? 0)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function BarChart({
  data,
  height = 200,
  color = 'var(--accent)',
}: {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 740;
  const H = height;
  const padX = 6;
  const padT = 14;
  const padB = 26;
  const n = Math.max(data.length, 1);
  const innerH = H - padT - padB;
  const innerW = W - padX * 2;
  const gap = innerW / n;
  const bw = gap * 0.58;
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = Math.max(1, Math.ceil(n / 10));

  return (
    <div className="chart" style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="نشاط حسب اليوم">
        {data.map((d, i) => {
          const h = Math.max((d.value / max) * innerH, d.value > 0 ? 2 : 0);
          const bx = padX + i * gap + (gap - bw) / 2;
          const by = padT + innerH - h;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={bx - (gap - bw) / 2} y={padT} width={gap} height={innerH} fill="transparent" />
              <rect x={bx} y={by} width={bw} height={h} rx={4} style={{ fill: hover === i ? 'var(--accent-bright)' : color }} />
              {i % step === 0 && (
                <text className="axis-label" x={bx + bw / 2} y={H - 8} textAnchor="middle">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover != null && hover < data.length && (
        <div style={{ ...tip, left: `${((padX + hover * gap + gap / 2) / W) * 100}%` }}>
          <b>{data[hover].label}</b>
          <div className="tnum">{fmt(data[hover].value)}</div>
        </div>
      )}
    </div>
  );
}

export function Donut({ data, size = 156 }: { data: { label: string; value: number; color: string }[]; size?: number }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  const r = size / 2 - 13;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;
  let off = 0;
  return (
    <div className="donut-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="توزيع العقوبات">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-3)" strokeWidth="14" />
        {total > 0 &&
          data.map((d, i) => {
            const len = (d.value / total) * c;
            const el = (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={d.color}
                strokeWidth="14"
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-off}
                transform={`rotate(-90 ${cx} ${cy})`}
              />
            );
            off += len;
            return el;
          })}
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" className="donut-center tnum" fill="var(--text)">
          {total}
        </text>
      </svg>
      <div className="donut-legend">
        {data.map((d) => (
          <div className="dl" key={d.label}>
            <span className="sw" style={{ background: d.color }} />
            {d.label}
            <span className="v tnum">{fmt(d.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Sparkline({ values, color = 'var(--accent)', height = 38 }: { values: number[]; color?: string; height?: number }) {
  const gid = useId();
  const W = 160;
  const H = height;
  const n = values.length;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const x = (i: number) => (i / Math.max(n - 1, 1)) * W;
  const yv = (v: number) => H - 4 - ((v - min) / range) * (H - 8);
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${yv(v)}`).join(' ');
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${W},${H} L0,${H} Z`} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
