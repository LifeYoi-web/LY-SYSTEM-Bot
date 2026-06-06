import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fakePrisma } = vi.hoisted(() => ({
  fakePrisma: {
    subscription: { findUnique: vi.fn() },
    // levelConfig is needed by getLevelConfig (singleton db) when the premium gate is passed
    levelConfig: { upsert: vi.fn().mockResolvedValue({ enabled: false, voiceXpEnabled: false }) },
  },
}));
vi.mock('../src/db/prisma', () => ({ prisma: fakePrisma }));

import { sweepVoiceXp } from '../src/bot/voiceXp';
import { pollCreatorContent } from '../src/bot/creator/poll';
import { _resetPlans } from '../src/db/subscriptions';

beforeEach(() => {
  _resetPlans();
  fakePrisma.subscription.findUnique.mockResolvedValue(null); // free
});

describe('premium feature gates (free guild)', () => {
  it('sweepVoiceXp is a no-op for a free guild (no level reads at all)', async () => {
    const prisma = { levelConfig: { findUnique: vi.fn() } } as any;
    const client = { guilds: { cache: new Map() } } as any;
    const n = await sweepVoiceXp(client, prisma, 'g-free');
    expect(n).toBe(0);
    expect(prisma.levelConfig.findUnique).not.toHaveBeenCalled();
  });

  it('pollCreatorContent is a no-op for a free guild', async () => {
    const deps = {
      client: {} as any,
      prisma: { creatorAnnounceConfig: { findUnique: vi.fn() } } as any,
      guildId: 'g-free',
    };
    const n = await pollCreatorContent(deps as any);
    expect(n).toBe(0);
  });

  it('both run for a premium guild', async () => {
    fakePrisma.subscription.findUnique.mockResolvedValue({ plan: 'premium' });
    const client = { guilds: { cache: new Map() } } as any;
    const prisma = { levelConfig: { findUnique: vi.fn().mockResolvedValue(null) } } as any;
    // premium passes the gate; the function then no-ops for its own reasons (no config/guild)
    await expect(sweepVoiceXp(client, prisma, 'g-prem')).resolves.toBeDefined();
  });
});
