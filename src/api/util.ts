import type { Client, TextChannel } from 'discord.js';

/** Coerce an optional id/string field: empty/whitespace clears it to null. */
export const optStr = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return s ? s : null;
};

/**
 * Resolve a client-supplied channel id ONLY if it is a text channel of the
 * tenant guild. The shared bot sits in many guilds — without this gate a staff
 * member of guild B could make the bot post into guild A's channels (the
 * cross-tenant channel-write class from the أ2 security review).
 */
export function tenantTextChannel(client: Client, guildId: string, channelId: string): TextChannel | null {
  const channel = client.channels.cache.get(channelId) as TextChannel | undefined;
  if (!channel || !channel.isTextBased?.()) return null;
  if (!('guildId' in channel) || channel.guildId !== guildId) return null;
  return channel;
}

/** True when the channel id belongs to the tenant guild (any channel type — for config saves). */
export function channelInGuild(client: Client, guildId: string, channelId: string): boolean {
  const channel = client.channels.cache.get(channelId);
  return Boolean(channel && 'guildId' in channel && (channel as { guildId: string }).guildId === guildId);
}
