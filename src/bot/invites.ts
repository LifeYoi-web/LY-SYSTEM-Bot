import type { Guild, GuildMember } from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import { getInviteConfig } from '../db/community';

// guildId -> (invite code -> uses). Rebuilt on ready and refreshed on every join so we
// can diff which code incremented and attribute the join to its owner.
const inviteCache = new Map<string, Map<string, number>>();

async function snapshot(guild: Guild): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  const invites = await guild.invites.fetch().catch(() => null);
  if (invites) for (const inv of invites.values()) m.set(inv.code, inv.uses ?? 0);
  return m;
}

export async function cacheGuildInvites(guild: Guild): Promise<void> {
  inviteCache.set(guild.id, await snapshot(guild));
}

export interface Attribution {
  inviterId: string; // "" = unknown / vanity
  code: string | null;
  fake: boolean;
}

/** Diff invite uses to attribute `member`'s join, persist it, and bump the inviter's stats. */
export async function attributeJoin(guild: Guild, prisma: PrismaClient, member: GuildMember): Promise<Attribution | null> {
  const cfg = await getInviteConfig(guild.id).catch(() => null);
  if (!cfg?.enabled) return null;

  const before = inviteCache.get(guild.id) ?? new Map<string, number>();
  const current = await guild.invites.fetch().catch(() => null);
  let inviterId = '';
  let code: string | null = null;
  if (current) {
    for (const inv of current.values()) {
      if ((inv.uses ?? 0) > (before.get(inv.code) ?? 0)) {
        inviterId = inv.inviter?.id ?? '';
        code = inv.code;
        break;
      }
    }
    const next = new Map<string, number>();
    for (const inv of current.values()) next.set(inv.code, inv.uses ?? 0);
    inviteCache.set(guild.id, next);
  }

  const ageDays = (Date.now() - member.user.createdTimestamp) / 86_400_000;
  const fake = ageDays < cfg.fakeDays;

  await prisma.inviteRecord.create({ data: { guildId: guild.id, inviterId, joinerId: member.id, code, fake } }).catch(() => undefined);

  if (inviterId) {
    await prisma.inviteStat
      .upsert({
        where: { guildId_userId: { guildId: guild.id, userId: inviterId } },
        create: { guildId: guild.id, userId: inviterId, regular: fake ? 0 : 1, fake: fake ? 1 : 0 },
        update: fake ? { fake: { increment: 1 } } : { regular: { increment: 1 } },
      })
      .catch(() => undefined);

    if (cfg.rewardRoleId && cfg.rewardThreshold > 0 && !fake) {
      const stat = await prisma.inviteStat.findUnique({ where: { guildId_userId: { guildId: guild.id, userId: inviterId } } });
      if (stat && stat.regular >= cfg.rewardThreshold) {
        const inviter = await guild.members.fetch(inviterId).catch(() => null);
        await inviter?.roles.add(cfg.rewardRoleId).catch(() => undefined);
      }
    }
  }
  return { inviterId, code, fake };
}

/** On leave, mark the join record and decrement the inviter's regular count (count a "left"). */
export async function markLeft(guild: Guild, prisma: PrismaClient, userId: string): Promise<void> {
  const rec = await prisma.inviteRecord.findFirst({
    where: { guildId: guild.id, joinerId: userId, left: false },
    orderBy: { createdAt: 'desc' },
  });
  if (!rec) return;
  await prisma.inviteRecord.update({ where: { id: rec.id }, data: { left: true } }).catch(() => undefined);
  if (rec.inviterId && !rec.fake) {
    await prisma.inviteStat
      .update({
        where: { guildId_userId: { guildId: guild.id, userId: rec.inviterId } },
        data: { regular: { decrement: 1 }, left: { increment: 1 } },
      })
      .catch(() => undefined);
  }
}

export function _resetInviteCache(): void {
  inviteCache.clear();
}
