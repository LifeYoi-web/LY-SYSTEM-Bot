import { describe, it, expect } from 'vitest';
import { detectAlerts, type DayStat, type AlertRules } from '../src/shared/alerts';

const rules: AlertRules = {
  leaveSpikeEnabled: true,
  leaveSpikeThreshold: 10,
  activityDropEnabled: true,
  activityDropPct: 50,
  joinSpikeEnabled: true,
  joinSpikeThreshold: 20,
};

const day = (date: string, messages: number, joins: number, leaves: number): DayStat => ({ date, messages, joins, leaves });

describe('detectAlerts', () => {
  it('returns nothing when today is absent from the series', () => {
    expect(detectAlerts([day('2026-06-01', 100, 1, 1)], '2026-06-03', rules)).toEqual([]);
  });

  it('flags a leave spike at/above threshold', () => {
    const hits = detectAlerts([day('2026-06-03', 100, 0, 12)], '2026-06-03', rules);
    expect(hits.map((h) => h.rule)).toContain('leave_spike');
  });

  it('flags a join spike at/above threshold', () => {
    const hits = detectAlerts([day('2026-06-03', 100, 25, 0)], '2026-06-03', rules);
    expect(hits.map((h) => h.rule)).toContain('join_spike');
  });

  it('flags an activity drop below the prior-days average (needs >= 3 prior days)', () => {
    const series = [
      day('2026-05-31', 100, 0, 0),
      day('2026-06-01', 120, 0, 0),
      day('2026-06-02', 110, 0, 0),
      day('2026-06-03', 30, 0, 0), // avg ~110, 30 < 55
    ];
    const hits = detectAlerts(series, '2026-06-03', rules);
    expect(hits.map((h) => h.rule)).toContain('activity_drop');
  });

  it('does not flag activity drop with too few prior days', () => {
    const series = [day('2026-06-02', 100, 0, 0), day('2026-06-03', 1, 0, 0)];
    expect(detectAlerts(series, '2026-06-03', rules)).toEqual([]);
  });

  it('respects disabled rules', () => {
    const off: AlertRules = { ...rules, leaveSpikeEnabled: false };
    expect(detectAlerts([day('2026-06-03', 100, 0, 99)], '2026-06-03', off)).toEqual([]);
  });
});
