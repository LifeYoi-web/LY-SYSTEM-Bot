import { prisma } from './prisma';
import type { GuildSettings } from '@prisma/client';

const cache = new Map<string, GuildSettings>();

/** Fields the dashboard is allowed to write to GuildSettings. */
export type EditableSettings = Partial<
  Pick<
    GuildSettings,
    | 'language'
    | 'logChannelId'
    | 'staffRoleIds'
    | 'welcomeEnabled'
    | 'welcomeChannelId'
    | 'welcomeMessage'
    | 'goodbyeEnabled'
    | 'goodbyeMessage'
    | 'autoRoleId'
    | 'botPresenceType'
    | 'botPresenceText'
    | 'botPresenceUrl'
    | 'rulesEnabled'
    | 'rulesChannelId'
    | 'rulesMessage'
    | 'rulesRoleId'
    | 'rulesButtonLabel'
    | 'welcomeUseCard'
    | 'welcomeCardBg'
    | 'welcomeButtons'
    | 'welcomeDmEnabled'
    | 'welcomeDmMessage'
    | 'welcomeMentionDeleteSeconds'
    | 'goodbyeUseCard'
  >
>;

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

export async function updateSettings(
  guildId: string,
  data: EditableSettings,
): Promise<GuildSettings> {
  // The `welcomeButtons` Json column needs Prisma's InputJsonValue (which rejects plain `null` in
  // favor of the JsonNull sentinel), while EditableSettings derives the symmetric read type.
  // The route validates the shape, so we widen here rather than threading the asymmetric type out.
  const settings = await prisma.guildSettings.update({
    where: { guildId },
    data: data as Parameters<typeof prisma.guildSettings.update>[0]['data'],
  });
  cache.set(guildId, settings);
  return settings;
}
