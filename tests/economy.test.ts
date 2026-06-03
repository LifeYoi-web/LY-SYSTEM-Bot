import { describe, it, expect } from 'vitest';
import { computeDaily, formatBalance } from '../src/shared/economy';

const cfg = { dailyAmount: 200, streakBonus: 50, maxStreakBonus: 500 };
const at = (iso: string) => new Date(iso);

describe('computeDaily', () => {
  it('grants the base amount on a first-ever claim', () => {
    expect(computeDaily(null, 0, cfg, at('2026-06-03T10:00:00Z'))).toEqual({ claimed: true, amount: 200, streak: 1 });
  });

  it('rejects a second claim on the same UTC day', () => {
    const last = at('2026-06-03T01:00:00Z');
    expect(computeDaily(last, 3, cfg, at('2026-06-03T23:00:00Z'))).toEqual({ claimed: false, amount: 0, streak: 3 });
  });

  it('continues the streak and adds the bonus when claimed the next day', () => {
    const last = at('2026-06-02T10:00:00Z');
    // streak 1 -> 2, bonus = (2-1)*50 = 50
    expect(computeDaily(last, 1, cfg, at('2026-06-03T09:00:00Z'))).toEqual({ claimed: true, amount: 250, streak: 2 });
  });

  it('resets the streak to 1 after a missed day', () => {
    const last = at('2026-05-30T10:00:00Z');
    expect(computeDaily(last, 9, cfg, at('2026-06-03T10:00:00Z'))).toEqual({ claimed: true, amount: 200, streak: 1 });
  });

  it('caps the streak bonus at maxStreakBonus', () => {
    const last = at('2026-06-02T10:00:00Z');
    // huge prior streak -> bonus would exceed cap, so amount = base + cap
    const r = computeDaily(last, 100, cfg, at('2026-06-03T10:00:00Z'));
    expect(r.claimed).toBe(true);
    expect(r.amount).toBe(200 + 500);
    expect(r.streak).toBe(101);
  });
});

describe('formatBalance', () => {
  it('formats with thousands separators and the emoji', () => {
    expect(formatBalance(1250, '🪙')).toBe('1,250 🪙');
  });
});
