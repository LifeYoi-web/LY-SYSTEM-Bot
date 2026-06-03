// Pure economy math — no DB, no Discord. Unit-tested in tests/economy.test.ts.

export interface DailyConfig {
  dailyAmount: number;
  streakBonus: number;
  maxStreakBonus: number;
}

export interface DailyResult {
  /** false when the daily was already claimed today */
  claimed: boolean;
  amount: number;
  streak: number;
}

/** UTC day index (days since epoch). */
function dayNumber(d: Date): number {
  return Math.floor(d.getTime() / 86_400_000);
}

/**
 * Resolve a /daily claim. Streak continues only when the previous claim was the
 * immediately preceding UTC day; a gap resets it to 1. Same-day re-claims are rejected.
 */
export function computeDaily(
  lastDaily: Date | null,
  currentStreak: number,
  cfg: DailyConfig,
  now: Date = new Date(),
): DailyResult {
  if (!lastDaily) return { claimed: true, amount: cfg.dailyAmount, streak: 1 };
  const today = dayNumber(now);
  const last = dayNumber(lastDaily);
  if (last >= today) return { claimed: false, amount: 0, streak: currentStreak };
  const streak = last === today - 1 ? currentStreak + 1 : 1;
  const bonus = Math.min(cfg.maxStreakBonus, Math.max(0, streak - 1) * cfg.streakBonus);
  return { claimed: true, amount: cfg.dailyAmount + bonus, streak };
}

/** Format a balance with its currency emoji, e.g. "1,250 🪙". */
export function formatBalance(amount: number, emoji: string): string {
  return `${amount.toLocaleString('en-US')} ${emoji}`.trim();
}
