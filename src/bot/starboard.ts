import { EmbedBuilder, type Client, type Message, type TextChannel } from 'discord.js';
import type { PrismaClient, StarboardConfig } from '@prisma/client';

// In-process lock per source message: starboard reactions arrive concurrently, and
// without this the check-then-insert could post the same message twice.
const processing = new Set<string>();

export async function syncStarboard(
  client: Client,
  prisma: PrismaClient,
  msg: Message,
  cfg: StarboardConfig,
  count: number,
): Promise<void> {
  const guildId = msg.guildId;
  if (!guildId || !cfg.enabled || !cfg.channelId) return;
  if (msg.channelId === cfg.channelId) return; // never star the starboard itself
  const sbChannel = client.channels.cache.get(cfg.channelId) as TextChannel | undefined;
  if (!sbChannel?.isTextBased?.()) return;
  if (processing.has(msg.id)) return;
  processing.add(msg.id);
  try {
    const existing = await prisma.starboardEntry.findUnique({
      where: { guildId_sourceMessageId: { guildId, sourceMessageId: msg.id } },
    });
    if (!existing && count < cfg.threshold) return; // hasn't crossed the threshold yet

    const embed = new EmbedBuilder()
      .setColor(0xf57c00)
      .setDescription(`${msg.content ?? ''}\n\n[↗️ الرسالة الأصلية](${msg.url})`)
      .setTimestamp(msg.createdAt);
    if (msg.author) embed.setAuthor({ name: msg.author.username, iconURL: msg.author.displayAvatarURL() });
    const image = msg.attachments?.find((a) => a.contentType?.startsWith('image/'));
    if (image) embed.setImage(image.url);
    const content = `${cfg.emoji} **${count}** | <#${msg.channelId}>`;

    if (existing) {
      await prisma.starboardEntry.update({ where: { id: existing.id }, data: { count } });
      const sbMsg = await sbChannel.messages.fetch(existing.starboardMessageId).catch(() => null);
      await sbMsg?.edit({ content, embeds: [embed] }).catch(() => undefined);
    } else {
      const sbMsg = await sbChannel.send({ content, embeds: [embed] }).catch(() => null);
      if (sbMsg) {
        await prisma.starboardEntry.create({
          data: { guildId, sourceMessageId: msg.id, starboardMessageId: sbMsg.id, count },
        });
      }
    }
  } finally {
    processing.delete(msg.id);
  }
}
