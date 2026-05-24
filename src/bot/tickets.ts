import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  type Guild,
  type TextChannel,
  type OverwriteResolvable,
} from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import { getTicketConfig, invalidateTicketConfig } from '../db/community';
import { logEvent } from './logging';

export function buildTicketPanel(openMessage?: string | null) {
  const embed = new EmbedBuilder()
    .setColor(0xf57c00)
    .setTitle('🎫 الدعم الفني')
    .setDescription(openMessage || 'هل تحتاج مساعدة؟ اضغط الزر لفتح تذكرة خاصة بينك وبين فريق الدعم.');
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('ticket:open').setLabel('افتح تذكرة').setEmoji('🎫').setStyle(ButtonStyle.Primary),
  );
  return { embeds: [embed], components: [row] };
}

/** Create a private ticket channel for the user. Returns the channel, or null if disabled/failed. */
export async function openTicket(guild: Guild, prisma: PrismaClient, userId: string): Promise<TextChannel | null> {
  const cfg = await getTicketConfig(guild.id);
  if (!cfg.enabled) return null;

  // Block opening a second ticket while one is already open.
  const existing = await prisma.ticket.findFirst({ where: { guildId: guild.id, userId, status: 'open' } });
  if (existing) {
    const ch = guild.channels.cache.get(existing.channelId) as TextChannel | undefined;
    if (ch) return ch;
  }

  const updated = await prisma.ticketConfig.update({ where: { guildId: guild.id }, data: { counter: { increment: 1 } } });
  const number = updated.counter;
  invalidateTicketConfig(guild.id); // keep the cached config's counter in sync with the DB

  const overwrites: OverwriteResolvable[] = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
  ];
  if (cfg.supportRoleId) {
    overwrites.push({
      id: cfg.supportRoleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    });
  }

  const channel = (await guild.channels
    .create({
      name: `ticket-${number}`,
      type: ChannelType.GuildText,
      parent: cfg.categoryId ?? undefined,
      permissionOverwrites: overwrites,
    })
    .catch(() => null)) as TextChannel | null;
  if (!channel) {
    // Roll the counter back so a failed creation doesn't permanently skip a number.
    await prisma.ticketConfig.update({ where: { guildId: guild.id }, data: { counter: { decrement: 1 } } }).catch(() => undefined);
    invalidateTicketConfig(guild.id);
    return null;
  }

  await prisma.ticket.create({ data: { guildId: guild.id, channelId: channel.id, userId, number } });
  const embed = new EmbedBuilder()
    .setColor(0xf57c00)
    .setTitle(`تذكرة #${number}`)
    .setDescription(`أهلًا <@${userId}>! اشرح مشكلتك وفريق الدعم بيكون معك قريبًا.`);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('ticket:close').setLabel('إغلاق التذكرة').setEmoji('🔒').setStyle(ButtonStyle.Danger),
  );
  await channel
    .send({ content: `<@${userId}>${cfg.supportRoleId ? ` <@&${cfg.supportRoleId}>` : ''}`, embeds: [embed], components: [row] })
    .catch(() => undefined);
  return channel;
}

/** Close (delete) a ticket channel and log it. Returns false if it wasn't an open ticket. */
export async function closeTicket(guild: Guild, prisma: PrismaClient, channelId: string, closedBy: string): Promise<boolean> {
  const ticket = await prisma.ticket.findFirst({ where: { guildId: guild.id, channelId, status: 'open' } });
  if (!ticket) return false;
  await prisma.ticket.update({ where: { id: ticket.id }, data: { status: 'closed', closedAt: new Date() } });
  await logEvent({ client: guild.client, prisma }, guild.id, 'ticket_close', {
    number: ticket.number,
    userId: ticket.userId,
    closedBy,
  });
  const channel = guild.channels.cache.get(channelId);
  await channel?.delete('Ticket closed').catch(() => undefined);
  return true;
}
