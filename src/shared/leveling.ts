// Pure XP curve helpers (no I/O) so they're trivially unit-testable.
// xp needed to advance FROM `level` to `level + 1`.
export function xpForNextLevel(level: number): number {
  return 5 * level * level + 50 * level + 100;
}

// Cumulative xp required to BE at `level`.
export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let i = 0; i < level; i++) total += xpForNextLevel(i);
  return total;
}

export function levelFromXp(xp: number): number {
  let level = 0;
  while (xp >= totalXpForLevel(level + 1)) level++;
  return level;
}

export interface LevelProgress {
  level: number;
  into: number; // xp earned within the current level
  needed: number; // xp span of the current level
  pct: number; // 0..100 progress to next level
}

export function progressInLevel(xp: number): LevelProgress {
  const level = levelFromXp(xp);
  const base = totalXpForLevel(level);
  const needed = xpForNextLevel(level);
  const into = xp - base;
  return { level, into, needed, pct: Math.min(100, Math.round((into / needed) * 100)) };
}
