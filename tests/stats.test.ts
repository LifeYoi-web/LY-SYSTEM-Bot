import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bump, flushStats, _resetStats, _peekStats } from '../src/bot/stats';

beforeEach(() => _resetStats());

describe('stats aggregator', () => {
  it('accumulates per-guild counters in memory', () => {
    bump('g1', 'messages');
    bump('g1', 'messages');
    bump('g1', 'joins');
    expect(_peekStats().size).toBe(1);
  });

  it('flushes increments to DailyStat and clears the buffer', async () => {
    bump('g1', 'messages', 2);
    bump('g1', 'joins');
    const upsert = vi.fn().mockResolvedValue({});
    const n = await flushStats({ dailyStat: { upsert } } as any, { g1: 50 });

    expect(n).toBe(1);
    const arg = upsert.mock.calls[0][0];
    expect(arg.update.messages).toEqual({ increment: 2 });
    expect(arg.update.joins).toEqual({ increment: 1 });
    expect(arg.update.memberCount).toBe(50);
    expect(arg.create).toMatchObject({ guildId: 'g1', messages: 2, joins: 1, memberCount: 50 });
    expect(_peekStats().size).toBe(0);
  });

  it('is a no-op flush when nothing is buffered', async () => {
    const upsert = vi.fn();
    expect(await flushStats({ dailyStat: { upsert } } as any)).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });
});
