import type { PrismaClient, LevelConfig } from '@prisma/client';
import { levelFromXp } from '../shared/leveling';

// Per-user XP cooldown (in memory) so we award at most once per cooldown window
// and avoid a DB write on every single message.
const cooldown = new Map<string, number>();

export interface XpResult {
  awarded: boolean;
  leveledUp: boolean;
  level: number;
}

interface RoleEditable {
  roles: { cache: { has: (id: string) => boolean }; add: (id: string) => Promise<unknown>; remove: (id: string) => Promise<unknown> };
}

/**
 * Increment a member's XP by `gain`, apply level-up + role rewards, and report the result.
 * Shared by message XP (with a cooldown gate) and the voice-activity sweep.
 */
export async function applyXpGain(
  prisma: PrismaClient,
  guildId: string,
  userId: string,
  member: RoleEditable | null,
  cfg: LevelConfig,
  gain: number,
  extra: Record<string, unknown> = {},
): Promise<XpResult> {
  if (gain <= 0) return { awarded: false, leveledUp: false, level: 0 };
  const row = await prisma.memberLevel.upsert({
    where: { guildId_userId: { guildId, userId } },
    create: { guildId, userId, xp: gain, level: levelFromXp(gain), ...extra },
    update: { xp: { increment: gain }, ...extra },
  });

  const newLevel = levelFromXp(row.xp);
  if (newLevel <= row.level) return { awarded: true, leveledUp: false, level: newLevel };

  await prisma.memberLevel.update({ where: { guildId_userId: { guildId, userId } }, data: { level: newLevel } });

  // Apply role rewards up to the new level.
  const rewards = await prisma.levelRoleReward.findMany({
    where: { guildId, level: { lte: newLevel } },
    orderBy: { level: 'desc' },
  });
  if (rewards.length && member) {
    if (cfg.stackRewards) {
      for (const r of rewards) await member.roles.add(r.roleId).catch(() => undefined);
    } else {
      const [top, ...rest] = rewards;
      await member.roles.add(top.roleId).catch(() => undefined);
      for (const r of rest) await member.roles.remove(r.roleId).catch(() => undefined);
    }
  }
  return { awarded: true, leveledUp: true, level: newLevel };
}

export async function awardMessageXp(
  prisma: PrismaClient,
  guildId: string,
  userId: string,
  member: RoleEditable | null,
  cfg: LevelConfig,
  now = Date.now(),
): Promise<XpResult> {
  const key = `${guildId}:${userId}`;
  const last = cooldown.get(key) ?? 0;
  if (now - last < cfg.cooldownSeconds * 1000) return { awarded: false, leveledUp: false, level: 0 };
  cooldown.set(key, now);
  if (cooldown.size > 20_000) {
    for (const [k, t] of cooldown) if (now - t > 3_600_000) cooldown.delete(k);
  }

  const gain = Math.max(1, cfg.xpPerMessage * cfg.multiplier);
  return applyXpGain(prisma, guildId, userId, member, cfg, gain, { lastMessageAt: new Date(now) });
}

export function _resetXpCooldown(): void {
  cooldown.clear();
}
