import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, type Client, type TextChannel } from 'discord.js';
import type { PrismaClient, Giveaway } from '@prisma/client';
import { pickWinners } from '../shared/random';

export function buildGiveawayMessage(g: Giveaway, ended = false) {
  const embed = new EmbedBuilder()
    .setColor(ended ? 0x6b6b78 : 0xf57c00)
    .setTitle('🎉 ' + g.prize)
    .setTimestamp(g.endsAt);
  embed.setDescription(
    ended
      ? `**انتهى السحب**\n**الفائزون:** ${g.winners.length ? g.winners.map((id) => `<@${id}>`).join('، ') : 'لا أحد'}`
      : `اضغط 🎉 للدخول في السحب!\n\n**عدد الفائزين:** ${g.winnerCount}\n**ينتهي:** <t:${Math.floor(g.endsAt.getTime() / 1000)}:R>\n**المشاركون:** ${g.entrants.length}`,
  );
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`gw:${g.id}`).setLabel('دخول').setEmoji('🎉').setStyle(ButtonStyle.Primary).setDisabled(ended),
  );
  return { embeds: [embed], components: [row] };
}

/** End a giveaway: pick winners, edit the message, announce. Returns the winners. */
export async function endGiveaway(client: Client, prisma: PrismaClient, g: Giveaway): Promise<string[]> {
  const winners = pickWinners(g.entrants, g.winnerCount);
  const updated = await prisma.giveaway.update({ where: { id: g.id }, data: { ended: true, winners } });
  const channel = client.channels.cache.get(g.channelId) as TextChannel | undefined;
  if (channel?.isTextBased?.()) {
    if (g.messageId) {
      const msg = await channel.messages.fetch(g.messageId).catch(() => null);
      await msg?.edit(buildGiveawayMessage(updated, true)).catch(() => undefined);
    }
    const announce = winners.length
      ? `🎉 مبروك ${winners.map((id) => `<@${id}>`).join('، ')}! فزتم بـ **${g.prize}**`
      : `انتهى سحب **${g.prize}** بدون مشاركين كافيين 😕`;
    await channel.send({ content: announce, allowedMentions: { users: winners } }).catch(() => undefined);
  }
  return winners;
}

export async function rerollGiveaway(client: Client, prisma: PrismaClient, g: Giveaway): Promise<string[]> {
  const winners = pickWinners(g.entrants, g.winnerCount);
  await prisma.giveaway.update({ where: { id: g.id }, data: { winners } });
  const channel = client.channels.cache.get(g.channelId) as TextChannel | undefined;
  if (channel?.isTextBased?.() && winners.length) {
    await channel
      .send({ content: `🔄 إعادة سحب **${g.prize}**: ${winners.map((id) => `<@${id}>`).join('، ')}`, allowedMentions: { users: winners } })
      .catch(() => undefined);
  }
  return winners;
}
