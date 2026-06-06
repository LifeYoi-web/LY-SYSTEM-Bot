import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fakePrisma } = vi.hoisted(() => ({
  fakePrisma: { subscription: { findUnique: vi.fn() } },
}));
vi.mock('../src/db/prisma', () => ({ prisma: fakePrisma }));

import { featureAllowed, upsellReply } from '../src/bot/premium';
import { _resetPlans } from '../src/db/subscriptions';

beforeEach(() => {
  _resetPlans();
  fakePrisma.subscription.findUnique.mockReset();
});

describe('featureAllowed', () => {
  it('false for a free guild on a premium feature', async () => {
    fakePrisma.subscription.findUnique.mockResolvedValue(null);
    expect(await featureAllowed('g1', 'music')).toBe(false);
  });
  it('true for a premium guild', async () => {
    fakePrisma.subscription.findUnique.mockResolvedValue({ plan: 'premium' });
    expect(await featureAllowed('g1', 'music')).toBe(true);
  });
});

describe('upsellReply', () => {
  it('is an ephemeral Arabic embed with an upgrade link button', () => {
    const payload = upsellReply('الموسيقى');
    expect(payload.flags).toBeDefined();
    const embed = payload.embeds[0].toJSON();
    expect(embed.title).toContain('بريميوم');
    expect(embed.description).toContain('الموسيقى');
    expect(payload.components).toHaveLength(1);
  });
});
