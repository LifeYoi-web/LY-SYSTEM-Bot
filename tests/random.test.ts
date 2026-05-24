import { describe, it, expect } from 'vitest';
import { pickWinners } from '../src/shared/random';

describe('pickWinners', () => {
  it('picks up to count unique entries from the pool', () => {
    const w = pickWinners([1, 2, 3, 4, 5], 3);
    expect(w).toHaveLength(3);
    expect(new Set(w).size).toBe(3);
    for (const x of w) expect([1, 2, 3, 4, 5]).toContain(x);
  });
  it('dedupes the pool before picking', () => {
    expect([...pickWinners(['a', 'a', 'b'], 5)].sort()).toEqual(['a', 'b']);
  });
  it('returns [] for an empty pool and clamps count', () => {
    expect(pickWinners([], 3)).toEqual([]);
    expect(pickWinners([1, 2], 9)).toHaveLength(2);
  });
  it('is deterministic with a seeded rng', () => {
    expect(pickWinners([1, 2, 3], 2, () => 0)).toHaveLength(2);
  });
});
