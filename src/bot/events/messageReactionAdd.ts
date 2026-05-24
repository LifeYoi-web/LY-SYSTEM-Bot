import { type MessageReaction, type PartialMessageReaction, type User, type PartialUser } from 'discord.js';
import { prisma } from '../../db/prisma';
import { getStarboard } from '../../db/community';
import { syncStarboard } from '../starboard';

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
      const cfg = await getStarboard(msg.guildId);
      if ((reaction.emoji.name ?? '') !== cfg.emoji) return;
      await syncStarboard(msg.client, prisma, msg as Parameters<typeof syncStarboard>[2], cfg, reaction.count ?? 0);
    } catch {
      /* reactions are best-effort */
    }
  },
};
