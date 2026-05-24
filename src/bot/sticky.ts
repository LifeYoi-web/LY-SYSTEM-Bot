import { EmbedBuilder, type Client, type TextChannel } from 'discord.js';
import type { PrismaClient } from '@prisma/client';

/** Delete the previous sticky message (if any) and repost it at the bottom of the channel. */
export async function repostSticky(client: Client, prisma: PrismaClient, guildId: string, channelId: string): Promise<void> {
  const sticky = await prisma.stickyMessage.findUnique({ where: { guildId_channelId: { guildId, channelId } } });
  if (!sticky || !sticky.enabled) return;
  const channel = client.channels.cache.get(channelId) as TextChannel | undefined;
  if (!channel?.isTextBased?.()) return;

  if (sticky.lastMessageId) {
    const old = await channel.messages.fetch(sticky.lastMessageId).catch(() => null);
    await old?.delete().catch(() => undefined);
  }
  const embed = new EmbedBuilder().setColor(0xf57c00).setDescription(sticky.content).setFooter({ text: '📌 رسالة مثبّتة' });
  const msg = await channel.send({ embeds: [embed] }).catch(() => null);
  if (msg) {
    await prisma.stickyMessage
      .update({ where: { guildId_channelId: { guildId, channelId } }, data: { lastMessageId: msg.id } })
      .catch(() => undefined);
  }
}
