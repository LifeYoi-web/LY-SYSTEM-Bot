import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  ChannelType,
  PermissionFlagsBits,
  type Client,
  type Guild,
  type GuildMember,
  type VoiceChannel,
  type OverwriteResolvable,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import type { PrismaClient, TempVoiceConfig, TempVoiceChannel } from '@prisma/client';
import { logger } from '../shared/logger';

const ORANGE = 0xf57c00;

/* ============================ pure helpers ============================ */

/** Resolve the configured name template ({user} = display name), capped to Discord's channel-name limit. */
export function applyTemplate(template: string, displayName: string): string {
  const out = (template || 'روم {user}').replace(/\{user\}/g, displayName).trim();
  return (out || `روم ${displayName}`).slice(0, 95);
}

/** The owner's control panel — posted inside the new voice channel's text chat. */
export function buildControlPanel(ownerId: string) {
  const embed = new EmbedBuilder()
    .setColor(ORANGE)
    .setTitle('🔊 لوحة تحكم الروم')
    .setDescription(`المالك: <@${ownerId}>\n\nهذي الأزرار تتحكم في هذا الروم فقط. لازم تكون مالك الروم لاستخدامها.`);
  const row1 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId('tv:rename').setLabel('إعادة تسمية').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tv:togglelock').setLabel('قفل/فتح').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tv:claim').setLabel('استلام').setEmoji('🙋').setStyle(ButtonStyle.Secondary),
  );
  const limit = new StringSelectMenuBuilder()
    .setCustomId('tv:limit')
    .setPlaceholder('👥 حدّد عدد الأعضاء')
    .addOptions(
      { label: 'بدون حد', value: '0', emoji: '∞' },
      { label: '٢ أعضاء', value: '2' },
      { label: '٥ أعضاء', value: '5' },
      { label: '١٠ أعضاء', value: '10' },
      { label: '٢٥ عضوًا', value: '25' },
    );
  const row2 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(limit);
  const kick = new UserSelectMenuBuilder().setCustomId('tv:kick').setPlaceholder('👢 اطرد عضوًا من الروم').setMaxValues(1);
  const row3 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(kick);
  return { embeds: [embed], components: [row1, row2, row3], allowedMentions: { parse: [] } };
}

/* ============================ side-effecting actions ============================ */

function ownerOverwrites(guild: Guild, ownerId: string, locked: boolean): OverwriteResolvable[] {
  const ow: OverwriteResolvable[] = [
    {
      id: ownerId,
      allow: [
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.MoveMembers,
        PermissionFlagsBits.MuteMembers,
        PermissionFlagsBits.DeafenMembers,
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak,
      ],
    },
  ];
  if (locked) {
    ow.push({ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect] });
  }
  return ow;
}

/**
 * Create a temp voice channel for a member who just joined the hub. If they already own one,
 * move them back into it instead of creating a duplicate.
 */
export async function createTempChannel(
  guild: Guild,
  prisma: PrismaClient,
  cfg: TempVoiceConfig,
  member: GuildMember,
): Promise<VoiceChannel | null> {
  // Already owns a live channel? Re-use it.
  const existing = await prisma.tempVoiceChannel.findFirst({ where: { guildId: guild.id, ownerId: member.id } });
  if (existing) {
    const ch = guild.channels.cache.get(existing.channelId) as VoiceChannel | undefined;
    if (ch) {
      await member.voice.setChannel(ch.id).catch(() => undefined);
      return ch;
    }
    // Stale row — channel was deleted out-of-band; clean it up so we can create fresh.
    await prisma.tempVoiceChannel.delete({ where: { channelId: existing.channelId } }).catch(() => undefined);
  }

  const name = applyTemplate(cfg.nameTemplate, member.displayName);
  const channel = (await guild.channels
    .create({
      name,
      type: ChannelType.GuildVoice,
      parent: cfg.categoryId ?? undefined,
      userLimit: cfg.defaultUserLimit > 0 ? cfg.defaultUserLimit : undefined,
      permissionOverwrites: ownerOverwrites(guild, member.id, cfg.defaultLocked),
    })
    .catch((err) => {
      logger.error(`tempvoice: create failed: ${err}`);
      return null;
    })) as VoiceChannel | null;
  if (!channel) return null;

  await prisma.tempVoiceChannel.create({
    data: { channelId: channel.id, guildId: guild.id, ownerId: member.id },
  });
  await member.voice.setChannel(channel.id).catch(() => undefined);
  await channel.send(buildControlPanel(member.id)).catch(() => undefined);
  return channel;
}

/** If a temp channel emptied, delete it and drop the row. */
export async function handleTempLeave(guild: Guild, prisma: PrismaClient, channelId: string): Promise<void> {
  const temp = await prisma.tempVoiceChannel.findUnique({ where: { channelId } });
  if (!temp) return;
  const channel = guild.channels.cache.get(channelId) as VoiceChannel | undefined;
  if (channel && channel.members.size > 0) return;
  await channel?.delete('Temp voice channel empty').catch(() => undefined);
  await prisma.tempVoiceChannel.delete({ where: { channelId } }).catch(() => undefined);
}

/**
 * Prune orphaned/empty temp channels at boot (in-memory state is lost across restarts).
 * Fleet-safety (SaaS Phase 0): strictly scoped to ONE guild — this client may not even
 * see other tenants' guilds, and must never touch their rows.
 */
export async function reconcileTempVoice(client: Client, prisma: PrismaClient, guildId: string): Promise<void> {
  const rows = await prisma.tempVoiceChannel.findMany({ where: { guildId } }).catch(() => [] as TempVoiceChannel[]);
  let pruned = 0;
  for (const row of rows) {
    // Defense in depth: never act on another guild's row even if the query was wrong.
    if (row.guildId !== guildId) continue;
    const guild = client.guilds.cache.get(row.guildId);
    // Guild not visible to this client (cold cache / kicked) — we cannot verify the
    // channel is truly gone, so leave the row alone.
    if (!guild) continue;
    const channel = guild.channels.cache.get(row.channelId) as VoiceChannel | undefined;
    if (!channel) {
      await prisma.tempVoiceChannel.delete({ where: { channelId: row.channelId } }).catch(() => undefined);
      pruned++;
      continue;
    }
    if (channel.members.size === 0) {
      await channel.delete('Temp voice reconcile — empty at boot').catch(() => undefined);
      await prisma.tempVoiceChannel.delete({ where: { channelId: row.channelId } }).catch(() => undefined);
      pruned++;
    }
  }
  if (rows.length) logger.info(`tempvoice: reconciled ${rows.length} row(s), pruned ${pruned} at boot`);
}

/* ---- owner actions (all return false when the channel isn't a live temp room) ---- */

export async function renameTempChannel(
  guild: Guild,
  prisma: PrismaClient,
  channelId: string,
  name: string,
): Promise<boolean> {
  const temp = await prisma.tempVoiceChannel.findUnique({ where: { channelId } });
  if (!temp) return false;
  const channel = guild.channels.cache.get(channelId) as VoiceChannel | undefined;
  if (!channel) return false;
  await channel.setName(name.slice(0, 95)).catch(() => undefined);
  return true;
}

export async function setTempLimit(
  guild: Guild,
  prisma: PrismaClient,
  channelId: string,
  limit: number,
): Promise<boolean> {
  const temp = await prisma.tempVoiceChannel.findUnique({ where: { channelId } });
  if (!temp) return false;
  const channel = guild.channels.cache.get(channelId) as VoiceChannel | undefined;
  if (!channel) return false;
  const clamped = Math.max(0, Math.min(99, Math.floor(limit)));
  await channel.setUserLimit(clamped).catch(() => undefined);
  return true;
}

/** Toggle @everyone Connect: returns the new lock state (`true` = now locked). */
export async function toggleLockTemp(
  guild: Guild,
  prisma: PrismaClient,
  channelId: string,
): Promise<boolean | null> {
  const temp = await prisma.tempVoiceChannel.findUnique({ where: { channelId } });
  if (!temp) return null;
  const channel = guild.channels.cache.get(channelId) as VoiceChannel | undefined;
  if (!channel) return null;
  const everyoneId = guild.roles.everyone.id;
  const existing = channel.permissionOverwrites.cache.get(everyoneId);
  const locked = existing?.deny.has(PermissionFlagsBits.Connect) ?? false;
  await channel.permissionOverwrites
    .edit(everyoneId, { Connect: locked ? null : false })
    .catch(() => undefined);
  return !locked;
}

export async function kickFromTemp(
  guild: Guild,
  prisma: PrismaClient,
  channelId: string,
  userId: string,
): Promise<boolean> {
  const temp = await prisma.tempVoiceChannel.findUnique({ where: { channelId } });
  if (!temp) return false;
  if (userId === temp.ownerId) return false; // can't kick the owner
  const channel = guild.channels.cache.get(channelId) as VoiceChannel | undefined;
  if (!channel) return false;
  await channel.permissionOverwrites.edit(userId, { Connect: false }).catch(() => undefined);
  const member = channel.members.get(userId);
  if (member) await member.voice.disconnect('Kicked from temp room').catch(() => undefined);
  return true;
}

/** Claim the room. Only allowed when the current owner is no longer present in the channel. */
export async function claimTemp(
  guild: Guild,
  prisma: PrismaClient,
  channelId: string,
  newOwnerId: string,
): Promise<boolean> {
  const temp = await prisma.tempVoiceChannel.findUnique({ where: { channelId } });
  if (!temp) return false;
  if (temp.ownerId === newOwnerId) return false; // already the owner
  const channel = guild.channels.cache.get(channelId) as VoiceChannel | undefined;
  if (!channel) return false;
  if (channel.members.has(temp.ownerId)) return false; // owner is still here — refuse the claim
  // Grant the new owner the same overwrites the original owner had.
  await channel.permissionOverwrites
    .edit(newOwnerId, {
      ManageChannels: true,
      MoveMembers: true,
      MuteMembers: true,
      DeafenMembers: true,
      ViewChannel: true,
      Connect: true,
      Speak: true,
    })
    .catch(() => undefined);
  await prisma.tempVoiceChannel.update({ where: { channelId }, data: { ownerId: newOwnerId } });
  return true;
}

/** Look up the temp-channel row by channel id (used by interaction handlers to check ownership). */
export async function getTempChannel(prisma: PrismaClient, channelId: string): Promise<TempVoiceChannel | null> {
  return prisma.tempVoiceChannel.findUnique({ where: { channelId } });
}
