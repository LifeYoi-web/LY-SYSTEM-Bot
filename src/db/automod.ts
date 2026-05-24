import { prisma } from './prisma';
import type { AutoModConfig } from '@prisma/client';

// AutoMod config is read on (potentially) every message, so it is cached in
// memory and only refreshed when the dashboard writes a change.
const cache = new Map<string, AutoModConfig>();

export const AUTOMOD_ACTIONS = ['delete', 'warn', 'mute', 'kick', 'ban'] as const;
export type AutoModAction = (typeof AUTOMOD_ACTIONS)[number];

export type EditableAutoMod = Partial<
  Pick<
    AutoModConfig,
    | 'enabled'
    | 'antiSpam'
    | 'antiInvite'
    | 'antiLink'
    | 'bannedWords'
    | 'maxMentions'
    | 'actionOnViolation'
    | 'muteSeconds'
    | 'ignoredChannelIds'
    | 'ignoredRoleIds'
  >
>;

export async function getAutoMod(guildId: string): Promise<AutoModConfig> {
  const cached = cache.get(guildId);
  if (cached) return cached;
  const cfg = await prisma.autoModConfig.upsert({
    where: { guildId },
    update: {},
    create: { guildId },
  });
  cache.set(guildId, cfg);
  return cfg;
}

export async function updateAutoMod(guildId: string, data: EditableAutoMod): Promise<AutoModConfig> {
  const cfg = await prisma.autoModConfig.upsert({
    where: { guildId },
    update: data,
    create: { guildId, ...data },
  });
  cache.set(guildId, cfg);
  return cfg;
}

export function invalidateAutoMod(guildId: string): void {
  cache.delete(guildId);
}
