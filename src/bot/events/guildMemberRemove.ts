import {
  GuildMember,
  PartialGuildMember,
  EmbedBuilder,
  AttachmentBuilder,
  type TextChannel,
} from 'discord.js';
import { prisma } from '../../db/prisma';
import { getSettings } from '../../db/settingsCache';
import { bump } from '../stats';
import { goodbyeText, formatAccountAge } from '../welcome';
import { renderWelcomeCard } from '../welcomeCard';
import { logEvent } from '../logging';
import { logger } from '../../shared/logger';
import { markLeft } from '../invites';

const GREY = 0x6b6b78;

module.exports = {
  name: 'guildMemberRemove',
  once: false,
  async execute(member: GuildMember | PartialGuildMember) {
    const guild = member.guild;
    bump(guild.id, 'leaves');
    await markLeft(guild, prisma, member.id).catch(() => undefined);
    const settings = await getSettings(guild.id).catch(() => null);

    if (settings?.goodbyeEnabled && settings.welcomeChannelId) {
      const channel = guild.channels.cache.get(settings.welcomeChannelId) as TextChannel | undefined;
      if (channel) await sendGoodbye(channel, member, settings);
    }

    await logEvent({ client: member.client, prisma }, guild.id, 'member_leave', {
      userId: member.id,
      username: member.user?.username ?? null,
    });
  },
};

async function sendGoodbye(channel: TextChannel, member: GuildMember | PartialGuildMember, settings: Awaited<ReturnType<typeof getSettings>>): Promise<void> {
  const guild = member.guild;
  const username = member.user?.username ?? 'عضو';
  const createdTimestamp = member.user?.createdTimestamp;
  const text = goodbyeText(settings.goodbyeMessage, {
    user: `<@${member.id}>`,
    username,
    server: guild.name,
    memberCount: guild.memberCount,
    position: guild.memberCount,
    createdTimestamp,
  });

  const embed = new EmbedBuilder()
    .setColor(GREY)
    .setTitle(`👋 وداعًا ${username}`)
    .setDescription(text)
    .setTimestamp();
  const avatar = member.user?.displayAvatarURL?.({ size: 256 });
  if (avatar) embed.setThumbnail(avatar);
  if (createdTimestamp) {
    embed.addFields({ name: '🕐 كان معنا منذ', value: formatAccountAge(createdTimestamp), inline: true });
  }
  embed.addFields({ name: '📊 العدد الآن', value: String(guild.memberCount), inline: true });

  const files: AttachmentBuilder[] = [];
  if (settings.goodbyeUseCard && member.displayName && avatar) {
    try {
      const buffer = await renderWelcomeCard({
        username: member.displayName,
        avatarUrl: avatar,
        position: guild.memberCount,
        serverName: guild.name,
        customBg: settings.welcomeCardBg,
        variant: 'goodbye',
      });
      files.push(new AttachmentBuilder(buffer, { name: 'goodbye.png' }));
      embed.setImage('attachment://goodbye.png');
    } catch (err) {
      logger.warning(`goodbye card render failed: ${err}`);
    }
  }

  await channel.send({ embeds: [embed], files, allowedMentions: { parse: [] } }).catch(() => undefined);
}
