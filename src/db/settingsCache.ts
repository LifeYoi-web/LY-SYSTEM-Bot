import { prisma } from './prisma';
import type { GuildSettings } from '@prisma/client';

const cache = new Map<string, GuildSettings>();

export async function ensureGuildSettings(guildId: string): Promise<GuildSettings> {
  const settings = await prisma.guildSettings.upsert({
    where: { guildId },
    update: {},
    create: { guildId },
  });
  cache.set(guildId, settings);
  return settings;
}

export async function getSettings(guildId: string): Promise<GuildSettings> {
  const cached = cache.get(guildId);
  if (cached) return cached;
  return ensureGuildSettings(guildId);
}

export function invalidateSettings(guildId: string): void {
  cache.delete(guildId);
}
