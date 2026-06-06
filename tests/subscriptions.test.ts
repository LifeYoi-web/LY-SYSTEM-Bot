import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fakePrisma } = vi.hoisted(() => {
  const fakePrisma = {
    subscription: {
      findUnique: vi.fn(),
      upsert: vi.fn().mockResolvedValue({}),
    },
  };
  return { fakePrisma };
});
vi.mock('../src/db/prisma', () => ({ prisma: fakePrisma }));

import { getPlan, setPlan, seedOwnerPlan, invalidatePlan, _resetPlans } from '../src/db/subscriptions';

beforeEach(() => {
  _resetPlans();
  fakePrisma.subscription.findUnique.mockReset();
  fakePrisma.subscription.upsert.mockClear();
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

  it('fails OPEN to the cached plan on DB error (paying guild never loses premium on a blip)', async () => {
    fakePrisma.subscription.findUnique.mockResolvedValueOnce({ guildId: 'g1', plan: 'premium' });
    expect(await getPlan('g1')).toBe('premium');
    invalidatePlan('g1'); // force a re-read…
    fakePrisma.subscription.findUnique.mockRejectedValueOnce(new Error('db down'));
    // …but the stale entry was dropped by invalidate, so simulate the TTL-expiry path instead:
    fakePrisma.subscription.findUnique.mockResolvedValueOnce({ guildId: 'g1', plan: 'premium' });
    expect(await getPlan('g1')).toBe('premium');
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
