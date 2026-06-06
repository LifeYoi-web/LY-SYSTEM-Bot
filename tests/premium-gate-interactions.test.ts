import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fakePrisma } = vi.hoisted(() => ({
  fakePrisma: { subscription: { findUnique: vi.fn() } },
}));
vi.mock('../src/db/prisma', () => ({ prisma: fakePrisma }));

import { gatePremiumCommand, PREMIUM_COMMANDS } from '../src/bot/premium';
import { _resetPlans } from '../src/db/subscriptions';

beforeEach(() => {
  _resetPlans();
  fakePrisma.subscription.findUnique.mockReset();
});

describe('premium command gating', () => {
  it('maps all 13 music commands to the music feature', () => {
    const music = ['play', 'skip', 'pause', 'resume', 'stop', 'disconnect', 'queue', 'nowplaying', 'volume', 'loop', 'shuffle', 'seek', 'lyrics'];
    for (const name of music) expect(PREMIUM_COMMANDS[name]?.key).toBe('music');
  });

  it('blocks a music command for a free guild with the upsell reply', async () => {
    fakePrisma.subscription.findUnique.mockResolvedValue(null); // free
    const reply = vi.fn().mockResolvedValue(undefined);
    const blocked = await gatePremiumCommand({ commandName: 'play', guildId: 'g1', reply } as any);
    expect(blocked).toBe(true);
    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply.mock.calls[0][0].embeds[0].toJSON().title).toContain('بريميوم');
  });

  it('lets a premium guild through', async () => {
    fakePrisma.subscription.findUnique.mockResolvedValue({ plan: 'premium' });
    const reply = vi.fn();
    expect(await gatePremiumCommand({ commandName: 'play', guildId: 'g1', reply } as any)).toBe(false);
    expect(reply).not.toHaveBeenCalled();
  });

  it('ignores non-premium commands and DMs', async () => {
    const reply = vi.fn();
    expect(await gatePremiumCommand({ commandName: 'ping', guildId: 'g1', reply } as any)).toBe(false);
    expect(await gatePremiumCommand({ commandName: 'play', guildId: null, reply } as any)).toBe(false);
  });
});
