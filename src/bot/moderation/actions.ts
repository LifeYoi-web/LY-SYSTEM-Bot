import type { PrismaClient, ModerationCase } from '@prisma/client';

export interface MemberLike {
  timeout(ms: number | null, reason?: string): Promise<unknown>;
}

export interface GuildLike {
  members: {
    ban(userId: string, options?: { reason?: string; deleteMessageSeconds?: number }): Promise<unknown>;
    kick(userId: string, reason?: string): Promise<unknown>;
    unban(userId: string, reason?: string): Promise<unknown>;
    fetch(userId: string): Promise<MemberLike>;
  };
}

export interface ActionDeps {
  guild: GuildLike;
  prisma: PrismaClient;
}

export type CaseType = 'ban' | 'kick' | 'mute' | 'warn';

interface BaseParams {
  guildId: string;
  targetUserId: string;
  moderatorId: string;
  reason?: string;
}
export interface BanParams extends BaseParams {
  deleteMessageSeconds?: number;
  expiresAt?: Date;
}
export type KickParams = BaseParams;
export interface MuteParams extends BaseParams {
  seconds: number;
}
export type WarnParams = BaseParams;

async function recordCase(
  deps: ActionDeps,
  type: CaseType,
  p: BaseParams,
  expiresAt: Date | null = null,
): Promise<ModerationCase> {
  const created = await deps.prisma.moderationCase.create({
    data: {
      guildId: p.guildId,
      targetUserId: p.targetUserId,
      moderatorId: p.moderatorId,
      type,
      reason: p.reason ?? null,
      expiresAt,
      active: true,
    },
  });
  await deps.prisma.logEntry.create({
    data: {
      guildId: p.guildId,
      type: `mod_${type}`,
      data: {
        caseId: created.id,
        targetUserId: p.targetUserId,
        moderatorId: p.moderatorId,
        reason: p.reason ?? null,
      },
    },
  });
  return created;
}

export async function banUser(deps: ActionDeps, p: BanParams): Promise<ModerationCase> {
  await deps.guild.members.ban(p.targetUserId, {
    reason: p.reason,
    deleteMessageSeconds: p.deleteMessageSeconds,
  });
  return recordCase(deps, 'ban', p, p.expiresAt ?? null);
}

export async function kickUser(deps: ActionDeps, p: KickParams): Promise<ModerationCase> {
  await deps.guild.members.kick(p.targetUserId, p.reason);
  return recordCase(deps, 'kick', p);
}

export async function muteUser(deps: ActionDeps, p: MuteParams): Promise<ModerationCase> {
  const member = await deps.guild.members.fetch(p.targetUserId);
  await member.timeout(p.seconds * 1000, p.reason);
  return recordCase(deps, 'mute', p, new Date(Date.now() + p.seconds * 1000));
}

export async function warnUser(deps: ActionDeps, p: WarnParams): Promise<ModerationCase> {
  return recordCase(deps, 'warn', p);
}

export async function liftCase(deps: ActionDeps, caseId: string): Promise<ModerationCase | null> {
  const found = await deps.prisma.moderationCase.findUnique({ where: { id: caseId } });
  if (!found) return null;
  if (found.active) {
    if (found.type === 'ban') {
      await deps.guild.members.unban(found.targetUserId, 'case lifted').catch(() => undefined);
    } else if (found.type === 'mute') {
      const member = await deps.guild.members.fetch(found.targetUserId).catch(() => null);
      await member?.timeout(null, 'case lifted');
    }
  }
  const updated = await deps.prisma.moderationCase.update({
    where: { id: caseId },
    data: { active: false },
  });
  await deps.prisma.logEntry.create({
    data: { guildId: found.guildId, type: `mod_lift_${found.type}`, data: { caseId } },
  });
  return updated;
}
