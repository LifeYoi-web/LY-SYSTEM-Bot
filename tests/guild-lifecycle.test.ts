import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

// Set DASHBOARD_URL before any modules are loaded so the guildCreate handler
// sees it in process.env and posts the onboarding embed.
process.env.DASHBOARD_URL = 'https://dash.example';

const { fakePrisma } = vi.hoisted(() => ({
  fakePrisma: {
    subscription: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    guildSettings: { upsert: vi.fn().mockResolvedValue({ guildId: 'g-new' }) },
  },
}));
vi.mock('../src/db/prisma', () => ({ prisma: fakePrisma }));

import { _resetPlans } from '../src/db/subscriptions';
import { _resetStats, bump, flushStats } from '../src/bot/stats';
import * as guildCreate from '../src/bot/events/guildCreate';
import * as guildDelete from '../src/bot/events/guildDelete';

function fakeGuild(id = 'g-new') {
  const send = vi.fn().mockResolvedValue({});
  return {
    id,
    name: 'سيرفر جديد',
    memberCount: 42,
    members: { me: { id: 'bot' } },
    systemChannel: {
      isTextBased: () => true,
      permissionsFor: () => ({ has: () => true }),
      send,
    },
    channels: { cache: new Map() },
    send,
  } as any;
}

beforeEach(() => {
  _resetPlans();
  _resetStats();
  vi.clearAllMocks();
});

afterAll(() => {
  delete process.env.DASHBOARD_URL;
});

describe('guildCreate', () => {
  it('ensures settings + free subscription, registers stats, posts onboarding', async () => {
    const g = fakeGuild();
    await guildCreate.execute(g);

    // ensureGuildSettings calls guildSettings.upsert
    expect(fakePrisma.guildSettings.upsert).toHaveBeenCalled();

    // ensureSubscription: first flips any 'left' rows back to 'active', then upserts
    expect(fakePrisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { guildId: 'g-new', status: 'left' },
      data: { status: 'active' },
    });
    expect(fakePrisma.subscription.upsert).toHaveBeenCalledWith({
      where: { guildId: 'g-new' },
      update: {},
      create: { guildId: 'g-new', plan: 'free' },
    });

    // onboarding embed posted to systemChannel
    expect(g.systemChannel.send).toHaveBeenCalledTimes(1);

    // allowStatsGuild was called — bump now reaches the bucket and flushStats persists it
    bump('g-new', 'messages');
    const upsertSpy = vi.fn().mockResolvedValue({});
    await flushStats({ dailyStat: { upsert: upsertSpy } } as any, 'g-new');
    expect(upsertSpy).toHaveBeenCalled();
  });

  it('never throws even when everything fails', async () => {
    fakePrisma.guildSettings.upsert.mockRejectedValueOnce(new Error('db down'));
    await expect(guildCreate.execute(fakeGuild())).resolves.toBeUndefined();
  });

  it('partial failure: subscription error skips stats + onboarding without throwing', async () => {
    fakePrisma.subscription.upsert.mockRejectedValueOnce(new Error('db hiccup'));
    const g = fakeGuild('g-partial');
    await expect(guildCreate.execute(g)).resolves.toBeUndefined();
    expect(g.systemChannel.send).not.toHaveBeenCalled(); // onboarding skipped
    // stats NOT allowlisted: a bump for the guild never reaches flush
    bump('g-partial', 'messages');
    const upsertSpy = vi.fn().mockResolvedValue({});
    await flushStats({ dailyStat: { upsert: upsertSpy } } as any, 'g-partial');
    expect(upsertSpy).not.toHaveBeenCalled();
  });
});

describe('guildDelete', () => {
  it('marks the subscription left', async () => {
    await guildDelete.execute({ id: 'g-gone', name: 'x' } as any);
    expect(fakePrisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { guildId: 'g-gone' },
      data: { status: 'left' },
    });
  });
});
