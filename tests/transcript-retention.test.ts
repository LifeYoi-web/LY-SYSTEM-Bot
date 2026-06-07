import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fakePrisma } = vi.hoisted(() => ({
  fakePrisma: { subscription: { findUnique: vi.fn() } },
}));
vi.mock('../src/db/prisma', () => ({ prisma: fakePrisma }));

import { pruneOldTranscripts } from '../src/bot/scheduler-tasks';
import { _resetPlans } from '../src/db/subscriptions';

beforeEach(() => _resetPlans());

describe('pruneOldTranscripts', () => {
  it('free guild: deletes transcripts older than 7 days, guild-scoped', async () => {
    fakePrisma.subscription.findUnique.mockResolvedValue(null); // free
    const deleteMany = vi.fn().mockResolvedValue({ count: 3 });
    const deps = { prisma: { ticketTranscript: { deleteMany } }, guildId: 'g1', client: {} } as any;
    const n = await pruneOldTranscripts(deps, new Date('2026-06-05T00:00:00Z'));
    expect(n).toBe(3);
    const arg = deleteMany.mock.calls[0][0];
    expect(arg.where.guildId).toBe('g1');
    expect(arg.where.createdAt.lt.toISOString()).toBe('2026-05-29T00:00:00.000Z'); // now - 7d
  });

  it('premium guild: never deletes', async () => {
    fakePrisma.subscription.findUnique.mockResolvedValue({ plan: 'premium' });
    const deleteMany = vi.fn();
    const deps = { prisma: { ticketTranscript: { deleteMany } }, guildId: 'g1', client: {} } as any;
    expect(await pruneOldTranscripts(deps as any)).toBe(0);
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
