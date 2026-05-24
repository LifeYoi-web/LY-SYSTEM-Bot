import type { Client } from 'discord.js';
import type { PrismaClient, Prisma } from '@prisma/client';
import { getSettings } from '../db/settingsCache';

export interface LogDeps {
  client: Client;
  prisma: PrismaClient;
}

/**
 * Record a structured event for the dashboard's Logs page, and — when an embed is
 * supplied and a log channel is configured — mirror it into that Discord channel.
 * Never throws: logging must not break the action that triggered it.
 */
export async function logEvent(
  deps: LogDeps,
  guildId: string,
  type: string,
  data: Record<string, unknown>,
  embed?: unknown,
): Promise<void> {
  await deps.prisma.logEntry
    .create({ data: { guildId, type, data: data as Prisma.InputJsonValue } })
    .catch(() => undefined);
  if (!embed) return;
  const settings = await getSettings(guildId).catch(() => null);
  if (!settings?.logChannelId) return;
  const channel = deps.client.channels.cache.get(settings.logChannelId) as
    | { send?: (payload: unknown) => Promise<unknown> }
    | undefined;
  await channel?.send?.({ embeds: [embed] }).catch(() => undefined);
}
