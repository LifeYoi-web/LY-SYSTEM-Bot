import { GuildMember, EmbedBuilder, type TextChannel } from 'discord.js';
import { prisma } from '../../db/prisma';
import { getSettings } from '../../db/settingsCache';
import { bump } from '../stats';
import { welcomeText } from '../welcome';
import { logEvent } from '../logging';

module.exports = {
  name: 'guildMemberAdd',
  once: false,
  async execute(member: GuildMember) {
    const guild = member.guild;
    bump(guild.id, 'joins');
    const settings = await getSettings(guild.id).catch(() => null);

    if (settings?.autoRoleId) {
      await member.roles.add(settings.autoRoleId).catch(() => undefined);
    }

    if (settings?.welcomeEnabled && settings.welcomeChannelId) {
      const channel = guild.channels.cache.get(settings.welcomeChannelId) as TextChannel | undefined;
      const text = welcomeText(settings.welcomeMessage, {
        user: `<@${member.id}>`,
        username: member.user.username,
        server: guild.name,
        memberCount: guild.memberCount,
      });
      const embed = new EmbedBuilder()
        .setColor(0xf57c00)
        .setDescription(text)
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();
      await channel?.send({ content: `<@${member.id}>`, embeds: [embed] }).catch(() => undefined);
    }

    await logEvent({ client: member.client, prisma }, guild.id, 'member_join', {
      userId: member.id,
      username: member.user.username,
    });
  },
};
