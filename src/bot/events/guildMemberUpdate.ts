import type { GuildMember, PartialGuildMember } from 'discord.js';
import { prisma } from '../../db/prisma';
import { handleBoostChange } from '../boosters';

module.exports = {
  name: 'guildMemberUpdate',
  once: false,
  async execute(oldMember: GuildMember | PartialGuildMember, newMember: GuildMember) {
    // Currently only used to detect Nitro boost start/stop (premiumSince change).
    await handleBoostChange(prisma, oldMember, newMember).catch(() => undefined);
  },
};
