import { GuildMember, PartialGuildMember, EmbedBuilder, type TextChannel } from 'discord.js';
import { prisma } from '../../db/prisma';
import { getSettings } from '../../db/settingsCache';
import { bump } from '../stats';
import { goodbyeText } from '../welcome';
import { logEvent } from '../logging';

module.exports = {
  name: 'guildMemberRemove',
  once: false,
  async execute(member: GuildMember | PartialGuildMember) {
    const guild = member.guild;
    bump(guild.id, 'leaves');
    const settings = await getSettings(guild.id).catch(() => null);

    if (settings?.goodbyeEnabled && settings.welcomeChannelId) {
      const channel = guild.channels.cache.get(settings.welcomeChannelId) as TextChannel | undefined;
      const text = goodbyeText(settings.goodbyeMessage, {
        user: `<@${member.id}>`,
        username: member.user?.username ?? 'عضو',
        server: guild.name,
        memberCount: guild.memberCount,
      });
      const embed = new EmbedBuilder().setColor(0x6b6b78).setDescription(text).setTimestamp();
      await channel?.send({ embeds: [embed] }).catch(() => undefined);
    }

    await logEvent({ client: member.client, prisma }, guild.id, 'member_leave', {
      userId: member.id,
      username: member.user?.username ?? null,
    });
  },
};
