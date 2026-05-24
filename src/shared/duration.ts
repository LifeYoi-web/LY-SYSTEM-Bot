const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

/** Parse "10m", "2h", "1d", "30s", "1w" → milliseconds. Returns null if invalid. */
export function parseDuration(input: string): number | null {
  const m = String(input).trim().toLowerCase().match(/^(\d+)\s*([smhdw])$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = n * UNIT_MS[m[2]];
  return ms > 0 && ms <= 365 * UNIT_MS.d ? ms : null; // cap at 1 year
}

/** Compact Arabic-ish duration label for display. */
export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} ثانية`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} دقيقة`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ساعة`;
  return `${Math.round(h / 24)} يوم`;
}
