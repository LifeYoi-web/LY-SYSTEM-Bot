import { MessageFlags, type ChatInputCommandInteraction, type ButtonInteraction } from 'discord.js';
import type { Player } from 'lavalink-client';
import { getMusicManager } from './manager';
import { voiceError } from './player';

export type MusicInteraction = ChatInputCommandInteraction | ButtonInteraction;

const EPH = { flags: MessageFlags.Ephemeral } as const;

/** Reply (or follow up) ephemerally, tolerant of already-acknowledged interactions. */
export async function musicReply(interaction: MusicInteraction, content: string): Promise<void> {
  const payload = { content, ...EPH };
  if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => undefined);
  else await interaction.reply(payload).catch(() => undefined);
}

/** The voice channel id the invoking member is currently in, or null. */
export async function memberVoiceChannelId(interaction: MusicInteraction): Promise<string | null> {
  if (!interaction.guild) return null;
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  return member?.voice?.channelId ?? null;
}

/**
 * Resolve the guild's active player after enforcing: music configured, in a guild, a live
 * player exists, and the member is in the same voice channel. Replies + returns null on failure.
 */
export async function resolveControllable(interaction: MusicInteraction): Promise<Player | null> {
  const mgr = getMusicManager();
  if (!mgr) {
    await musicReply(interaction, '🎵 الموسيقى غير مفعّلة على البوت حالياً.');
    return null;
  }
  if (!interaction.guildId) {
    await musicReply(interaction, 'هذا الأمر داخل السيرفر فقط.');
    return null;
  }
  const player = mgr.getPlayer(interaction.guildId);
  if (!player) {
    await musicReply(interaction, 'ما فيه شي يشتغل حالياً 🤷');
    return null;
  }
  const err = voiceError(await memberVoiceChannelId(interaction), player.voiceChannelId);
  if (err) {
    await musicReply(interaction, err);
    return null;
  }
  return player;
}
