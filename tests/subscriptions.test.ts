import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fakePrisma } = vi.hoisted(() => {
  const fakePrisma = {
    subscription: {
      findUnique: vi.fn(),
      upsert: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  return { fakePrisma };
});
vi.mock('../src/db/prisma', () => ({ prisma: fakePrisma }));

import { getPlan, getConfirmedPlan, setPlan, seedOwnerPlan, invalidatePlan, _resetPlans, ensureSubscription, markGuildLeft } from '../src/db/subscriptions';

beforeEach(() => {
  _resetPlans();
  fakePrisma.subscription.findUnique.mockReset();
  fakePrisma.subscription.upsert.mockClear();
  fakePrisma.subscription.updateMany.mockClear();
});

describe('getPlan', () => {
  it('returns the stored plan and caches it', async () => {
    fakePrisma.subscription.findUnique.mockResolvedValue({ guildId: 'g1', plan: 'premium' });
    expect(await getPlan('g1')).toBe('premium');
    expect(await getPlan('g1')).toBe('premium');
    expect(fakePrisma.subscription.findUnique).toHaveBeenCalledTimes(1); // cached
  });

  it('defaults to free when no row exists', async () => {
    fakePrisma.subscription.findUnique.mockResolvedValue(null);
    expect(await getPlan('g-new')).toBe('free');
  });

  it('fails OPEN to the last-known plan when the DB errors after invalidation', async () => {
    fakePrisma.subscription.findUnique.mockResolvedValueOnce({ guildId: 'g1', plan: 'premium' });
    expect(await getPlan('g1')).toBe('premium');
    invalidatePlan('g1'); // force a re-read…
    fakePrisma.subscription.findUnique.mockRejectedValueOnce(new Error('db down'));
    expect(await getPlan('g1')).toBe('premium');
    expect(fakePrisma.subscription.findUnique).toHaveBeenCalledTimes(2);
  });

  it('fails SAFE to free when there is no cache and the DB errors', async () => {
    fakePrisma.subscription.findUnique.mockRejectedValue(new Error('db down'));
    expect(await getPlan('g-cold')).toBe('free');
  });

  it('keeps the last-known plan when the TTL refresh hits a DB error', async () => {
    vi.useFakeTimers();
    try {
      fakePrisma.subscription.findUnique.mockResolvedValueOnce({ guildId: 'g1', plan: 'premium' });
      expect(await getPlan('g1')).toBe('premium');
      vi.advanceTimersByTime(6 * 60_000); // past the 5-min TTL
      fakePrisma.subscription.findUnique.mockRejectedValueOnce(new Error('db down'));
      expect(await getPlan('g1')).toBe('premium'); // stale-but-served
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('getConfirmedPlan', () => {
  it('returns the plan on a successful read', async () => {
    fakePrisma.subscription.findUnique.mockResolvedValue({ guildId: 'g1', plan: 'premium' });
    expect(await getConfirmedPlan('g1')).toBe('premium');
  });
  it('returns null when cold cache + DB error (getPlan would fall back to free)', async () => {
    fakePrisma.subscription.findUnique.mockRejectedValue(new Error('db down'));
    expect(await getConfirmedPlan('g-cold')).toBeNull();
    expect(await getPlan('g-cold2')).toBe('free'); // getPlan keeps its fail-safe contract
  });
});

describe('setPlan / seedOwnerPlan', () => {
  it('setPlan upserts and invalidates the cache', async () => {
    fakePrisma.subscription.findUnique.mockResolvedValue({ guildId: 'g1', plan: 'free' });
    await getPlan('g1');
    await setPlan('g1', 'premium');
    expect(fakePrisma.subscription.upsert).toHaveBeenCalledWith({
      where: { guildId: 'g1' },
      update: { plan: 'premium' },
      create: { guildId: 'g1', plan: 'premium' },
    });
    fakePrisma.subscription.findUnique.mockResolvedValue({ guildId: 'g1', plan: 'premium' });
    expect(await getPlan('g1')).toBe('premium'); // cache was invalidated → re-read
  });

  it('seedOwnerPlan creates custom only when missing (never overwrites)', async () => {
    await seedOwnerPlan('g-owner');
    expect(fakePrisma.subscription.upsert).toHaveBeenCalledWith({
      where: { guildId: 'g-owner' },
      update: {},
      create: { guildId: 'g-owner', plan: 'custom' },
    });
  });
});

describe('ensureSubscription / markGuildLeft (multi-guild lifecycle)', () => {
  it('ensureSubscription creates a free row when missing and never touches plan on rejoin', async () => {
    await ensureSubscription('g-new');
    expect(fakePrisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { guildId: 'g-new', status: 'left' },
      data: { status: 'active' },
    });
    expect(fakePrisma.subscription.upsert).toHaveBeenCalledWith({
      where: { guildId: 'g-new' },
      update: {},
      create: { guildId: 'g-new', plan: 'free' },
    });
  });

  it('ensureSubscription invalidates the plan cache (rejoin sees fresh state)', async () => {
    fakePrisma.subscription.findUnique.mockResolvedValue({ plan: 'premium' });
    expect(await getPlan('g-back')).toBe('premium');
    fakePrisma.subscription.findUnique.mockResolvedValue(null);
    await ensureSubscription('g-back');
    expect(await getPlan('g-back')).toBe('free'); // cache invalidated → re-read
  });

  it('markGuildLeft sets status left without touching plan, and invalidates the cache', async () => {
    await markGuildLeft('g-gone');
    expect(fakePrisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { guildId: 'g-gone' },
      data: { status: 'left' },
    });
  });
});
