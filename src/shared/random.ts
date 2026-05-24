/** Pick up to `count` unique winners from a pool via a partial Fisher-Yates shuffle. */
export function pickWinners<T>(pool: T[], count: number, rng: () => number = Math.random): T[] {
  const arr = [...new Set(pool)];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, Math.max(0, Math.min(count, arr.length)));
}
