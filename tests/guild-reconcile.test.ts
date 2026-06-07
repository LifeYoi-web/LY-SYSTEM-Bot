import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fakePrisma } = vi.hoisted(() => ({
  fakePrisma: {
    subscription: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    guildSettings: { upsert: vi.fn().mockResolvedValue({}) },
  },
}));
vi.mock('../src/db/prisma', () => ({ prisma: fakePrisma }));

import { reconcileKnownGuilds } from '../src/bot/guilds';
import { _resetPlans } from '../src/db/subscriptions';
import { _resetStats, bump, flushStats } from '../src/bot/stats';

beforeEach(() => {
  _resetPlans();
  _resetStats();
  vi.clearAllMocks();
});

function clientWith(ids: string[]) {
  return { guilds: { cache: new Map(ids.map((id) => [id, { id, name: `g-${id}` }])) } } as any;
}

describe('reconcileKnownGuilds', () => {
  it('ensures settings + subscription + stats for every cached guild', async () => {
    const n = await reconcileKnownGuilds(clientWith(['g1', 'g2']));
    expect(n).toBe(2);
    expect(fakePrisma.guildSettings.upsert).toHaveBeenCalledTimes(2);
    expect(fakePrisma.subscription.upsert).toHaveBeenCalledTimes(2);
    bump('g2', 'messages');
    const upsertSpy = vi.fn().mockResolvedValue({});
    await flushStats({ dailyStat: { upsert: upsertSpy } } as any, 'g2');
    expect(upsertSpy).toHaveBeenCalled();
  });

  it('one bad guild does not stop the others', async () => {
    fakePrisma.guildSettings.upsert.mockRejectedValueOnce(new Error('boom'));
    const n = await reconcileKnownGuilds(clientWith(['g1', 'g2']));
    expect(n).toBe(1); // g1 failed, g2 reconciled
  });
});
