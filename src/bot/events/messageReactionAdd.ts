import {
  EmbedBuilder,
  type MessageReaction,
  type PartialMessageReaction,
  type User,
  type PartialUser,
} from 'discord.js';
import { prisma } from '../../db/prisma';
import { getStarboard } from '../../db/community';
import { syncStarboard } from '../starboard';

const BOOKMARK_EMOJI = '🔖';

/** Best-effort DM the bookmarker a copy of the message. Never throws. */
async function sendBookmarkDM(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
): Promise<void> {
  const realUser = user.partial ? await user.fetch().catch(() => null) : user;
  if (!realUser) return;
  const msg = reaction.message;
  const channelName = msg.channel && 'name' in msg.channel ? `#${(msg.channel as { name: string }).name}` : msg.channelId;
  const embed = new EmbedBuilder()
    .setColor(0xf57c00)
    .setTitle('🔖 إشارة مرجعية')
    .setDescription((msg.content || '_(لا يوجد نص)_').slice(0, 2000))
    .setURL(msg.url)
    .addFields(
      { name: 'القناة', value: channelName, inline: true },
      { name: 'الكاتب', value: msg.author ? `<@${msg.author.id}>` : 'غير معروف', inline: true },
    )
    .setTimestamp(msg.createdAt ?? new Date());
  if (msg.attachments && msg.attachments.size > 0) {
    const urls = [...msg.attachments.values()]
      .map((a) => a.url)
      .join('\n')
      .slice(0, 1024);
    embed.addFields({ name: 'مرفقات', value: urls });
  }
  await realUser.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => undefined);
}

module.exports = {
  name: 'messageReactionAdd',
  once: false,
  async execute(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
    try {
      if (user.bot) return;
      if (reaction.partial) await reaction.fetch();
      const msg = reaction.message;
      if (msg.partial) await msg.fetch();
      if (!msg.guildId) return;

      // 🔖 — DM the reacting user a copy of the message. Independent of starboard.
      if (reaction.emoji.name === BOOKMARK_EMOJI) {
        await sendBookmarkDM(reaction, user);
        return;
      }

      const cfg = await getStarboard(msg.guildId);
      if ((reaction.emoji.name ?? '') !== cfg.emoji) return;
      await syncStarboard(msg.client, prisma, msg as Parameters<typeof syncStarboard>[2], cfg, reaction.count ?? 0);
    } catch {
      /* reactions are best-effort */
    }
  },
};
