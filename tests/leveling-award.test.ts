import { describe, it, expect, vi, beforeEach } from 'vitest';
import { awardMessageXp, _resetXpCooldown } from '../src/bot/leveling';

const cfg = (o: Record<string, unknown> = {}) =>
  ({
    guildId: 'g', enabled: true, xpPerMessage: 100, cooldownSeconds: 60, multiplier: 1,
    levelUpEnabled: true, levelUpChannelId: null, levelUpMessage: null, stackRewards: false, ...o,
  }) as any;

beforeEach(() => _resetXpCooldown());

describe('awardMessageXp', () => {
  it('awards once then respects the cooldown window', async () => {
    const prisma = {
      memberLevel: { upsert: vi.fn().mockResolvedValue({ xp: 100, level: 0 }), update: vi.fn() },
      levelRoleReward: { findMany: vi.fn().mockResolvedValue([]) },
    } as any;
    const t = 1_000_000;
    expect((await awardMessageXp(prisma, 'g', 'u1', null, cfg(), t)).awarded).toBe(true);
    expect((await awardMessageXp(prisma, 'g', 'u1', null, cfg(), t + 1000)).awarded).toBe(false);
    expect(prisma.memberLevel.upsert).toHaveBeenCalledTimes(1);
  });

  it('levels up and applies the highest role reward (no stacking)', async () => {
    const member = {
      roles: { cache: { has: () => false }, add: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockResolvedValue(undefined) },
    };
    const prisma = {
      memberLevel: { upsert: vi.fn().mockResolvedValue({ xp: 500, level: 0 }), update: vi.fn().mockResolvedValue({}) },
      levelRoleReward: { findMany: vi.fn().mockResolvedValue([{ level: 3, roleId: 'r3' }, { level: 1, roleId: 'r1' }]) },
    } as any;
    const r = await awardMessageXp(prisma, 'g', 'u2', member as any, cfg(), 2_000_000);
    expect(r.leveledUp).toBe(true);
    expect(member.roles.add).toHaveBeenCalledWith('r3');
    expect(member.roles.remove).toHaveBeenCalledWith('r1');
  });
});
