import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bump, flushStats, allowStatsGuild, _resetStats, _peekStats } from '../src/bot/stats';

beforeEach(() => {
  _resetStats();
  allowStatsGuild('g1');
});

describe('stats aggregator', () => {
  it('accumulates per-guild counters in memory', () => {
    bump('g1', 'messages');
    bump('g1', 'messages');
    bump('g1', 'joins');
    expect(_peekStats().size).toBe(1);
  });

  it('ignores bumps for guilds not on the allowlist (fleet-safety guard)', () => {
    bump('g-foreign', 'messages');
    expect(_peekStats().size).toBe(0);
  });

  it('flushes increments to DailyStat and clears the buffer', async () => {
    bump('g1', 'messages', 2);
    bump('g1', 'joins');
    const upsert = vi.fn().mockResolvedValue({});
    const n = await flushStats({ dailyStat: { upsert } } as any, 'g1', 50);

    expect(n).toBe(1);
    const arg = upsert.mock.calls[0][0];
    expect(arg.update.messages).toEqual({ increment: 2 });
    expect(arg.update.joins).toEqual({ increment: 1 });
    expect(arg.update.memberCount).toBe(50);
    expect(arg.create).toMatchObject({ guildId: 'g1', messages: 2, joins: 1, memberCount: 50 });
    expect(_peekStats().size).toBe(0);
  });

  it('flushes ONLY the requested guild and leaves other tenants buffered', async () => {
    allowStatsGuild('g2');
    bump('g1', 'messages');
    bump('g2', 'messages');
    const upsert = vi.fn().mockResolvedValue({});
    const n = await flushStats({ dailyStat: { upsert } } as any, 'g1');

    expect(n).toBe(1);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0].create.guildId).toBe('g1');
    // g2's bucket is untouched — its own tenant tick flushes it.
    expect(_peekStats().size).toBe(1);
    expect([..._peekStats().keys()][0].startsWith('g2|')).toBe(true);
  });

  it('is a no-op flush when nothing is buffered', async () => {
    const upsert = vi.fn();
    expect(await flushStats({ dailyStat: { upsert } } as any, 'g1')).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('re-queues counters when the DB upsert fails (no data loss)', async () => {
    bump('g1', 'messages', 3);
    const upsert = vi.fn().mockRejectedValueOnce(new Error('db down'));
    const persisted = await flushStats({ dailyStat: { upsert } } as any, 'g1');
    expect(persisted).toBe(0); // nothing persisted
    // counts merged back into the buffer for the next flush
    expect(_peekStats().get('g1|' + new Date().toISOString().slice(0, 10))?.messages).toBe(3);
  });

  it('restores the bucket after a failed flush with no intervening bump (normal failure path)', async () => {
    bump('g1', 'messages', 2);
    bump('g1', 'leaves');
    const upsert = vi.fn().mockRejectedValueOnce(new Error('db down'));
    await flushStats({ dailyStat: { upsert } } as any, 'g1');
    // The bucket was deleted before the upsert; the catch must re-create it whole.
    const key = 'g1|' + new Date().toISOString().slice(0, 10);
    expect(_peekStats().get(key)).toMatchObject({ messages: 2, leaves: 1 });
  });

  it('a failed g1 flush leaves g2 buckets untouched (cross-tenant isolation on the error path)', async () => {
    allowStatsGuild('g2');
    bump('g1', 'messages');
    bump('g2', 'messages', 5);
    const upsert = vi.fn().mockRejectedValueOnce(new Error('db down'));
    await flushStats({ dailyStat: { upsert } } as any, 'g1');
    const g2key = 'g2|' + new Date().toISOString().slice(0, 10);
    expect(_peekStats().get(g2key)?.messages).toBe(5);
  });
});
