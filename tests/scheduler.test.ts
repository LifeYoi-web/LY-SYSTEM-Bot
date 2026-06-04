import { describe, it, expect, vi } from 'vitest';
import { liftExpiredCases, computeNextRun, startScheduler } from '../src/bot/scheduler';

describe('computeNextRun', () => {
  it('returns null for a one-off', () => {
    expect(computeNextRun(new Date('2026-05-24T00:00:00Z'), 'none')).toBeNull();
  });
  it('advances a daily schedule to the next future occurrence', () => {
    const now = new Date('2026-05-24T12:00:00Z');
    const next = computeNextRun(new Date('2026-05-20T09:00:00Z'), 'daily', now);
    expect(next?.toISOString()).toBe('2026-05-25T09:00:00.000Z');
  });
  it('advances a weekly schedule past now', () => {
    const now = new Date('2026-05-24T12:00:00Z');
    const next = computeNextRun(new Date('2026-05-01T00:00:00Z'), 'weekly', now)!;
    expect(next.getTime()).toBeGreaterThan(now.getTime());
  });
});

describe('liftExpiredCases', () => {
  it('lifts each expired active case and returns the count', async () => {
    const member = { timeout: vi.fn().mockResolvedValue(undefined) };
    const guild = {
      members: {
        ban: vi.fn(),
        kick: vi.fn(),
        unban: vi.fn().mockResolvedValue(undefined),
        fetch: vi.fn().mockResolvedValue(member),
      },
    };
    const expired = [
      { id: 'c1', guildId: 'g1', targetUserId: 'u1', type: 'ban', active: true },
      { id: 'c2', guildId: 'g1', targetUserId: 'u2', type: 'mute', active: true },
    ];
    const prisma = {
      moderationCase: {
        findMany: vi.fn().mockResolvedValue(expired),
        findUnique: vi.fn().mockImplementation(({ where }: any) => Promise.resolve(expired.find((c) => c.id === where.id) ?? null)),
        update: vi.fn().mockImplementation(({ where, data }: any) => Promise.resolve({ id: where.id, ...data })),
      },
      logEntry: { create: vi.fn().mockResolvedValue(undefined) },
    };
    const n = await liftExpiredCases({ guild, prisma } as any, 'g1');
    expect(n).toBe(2);
    expect(prisma.moderationCase.findMany).toHaveBeenCalledWith({
      where: { guildId: 'g1', active: true, expiresAt: { not: null, lte: expect.any(Date) } },
    });
    expect(guild.members.unban).toHaveBeenCalledWith('u1', expect.any(String));
    expect(member.timeout).toHaveBeenCalledWith(null, expect.any(String));
  });

  it('returns 0 when nothing is expired', async () => {
    const prisma = { moderationCase: { findMany: vi.fn().mockResolvedValue([]) }, logEntry: { create: vi.fn() } };
    const guild = { members: {} };
    expect(await liftExpiredCases({ guild, prisma } as any, 'g1')).toBe(0);
  });
});

describe('startScheduler', () => {
  it('returns a clearable interval handle and does not tick synchronously', () => {
    const deps = { client: { guilds: { cache: new Map() } }, prisma: {}, guildId: 'g1' } as any;
    const handle = startScheduler(deps, 60_000);
    expect(handle).toBeDefined();
    clearInterval(handle);
  });
});
