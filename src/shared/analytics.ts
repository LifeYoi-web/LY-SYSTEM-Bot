export interface DayPoint {
  date: string;
  messages: number;
  joins: number;
  leaves: number;
  modActions: number;
  memberCount: number;
}

/** UTC day key, e.g. "2026-05-24". */
export function utcDateKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** The last `n` UTC day keys ending today, oldest first. */
export function lastNDates(n: number, today: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(utcDateKey(d));
  }
  return out;
}

/**
 * Densify sparse DailyStat rows into a continuous `days`-long series, filling
 * missing days with zeros so charts never have gaps.
 */
export function buildDateSeries(
  rows: Array<Partial<DayPoint> & { date: string }>,
  days: number,
  today: Date = new Date(),
): DayPoint[] {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  return lastNDates(days, today).map((date) => {
    const r: Partial<DayPoint> = byDate.get(date) ?? {};
    return {
      date,
      messages: r.messages ?? 0,
      joins: r.joins ?? 0,
      leaves: r.leaves ?? 0,
      modActions: r.modActions ?? 0,
      memberCount: r.memberCount ?? 0,
    };
  });
}

export function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(Math.max(n, min), max);
}
