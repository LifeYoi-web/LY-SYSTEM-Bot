import {
  GuildMember,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  type TextChannel,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import { prisma } from '../../db/prisma';
import { getSettings } from '../../db/settingsCache';
import { bump } from '../stats';
import { welcomeText, parseWelcomeButtons, formatAccountAge, renderTemplate, type WelcomeButton } from '../welcome';
import { renderWelcomeCard } from '../welcomeCard';
import { logEvent } from '../logging';
import { logger } from '../../shared/logger';

const ORANGE = 0xf57c00;

/** Build the welcome row from the configured link buttons. */
function buildButtonRow(buttons: WelcomeButton[]): ActionRowBuilder<MessageActionRowComponentBuilder> | null {
  if (buttons.length === 0) return null;
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>();
  for (const b of buttons) {
    const btn = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(b.label).setURL(b.url);
    if (b.emoji) {
      try {
        btn.setEmoji(b.emoji);
      } catch {
        /* invalid emoji string — drop it but keep the button */
      }
    }
    row.addComponents(btn);
  }
  return row;
}

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
      if (channel) await sendPremiumWelcome(channel, member, settings);
    }

    if (settings?.welcomeDmEnabled && settings.welcomeDmMessage) {
      const dm = renderTemplate(settings.welcomeDmMessage, {
        user: `<@${member.id}>`,
        username: member.user.username,
        server: guild.name,
        memberCount: guild.memberCount,
        position: guild.memberCount,
        createdTimestamp: member.user.createdTimestamp,
      });
      await member.send({ content: dm }).catch(() => undefined);
    }

    await logEvent({ client: member.client, prisma }, guild.id, 'member_join', {
      userId: member.id,
      username: member.user.username,
    });
  },
};

async function sendPremiumWelcome(channel: TextChannel, member: GuildMember, settings: Awaited<ReturnType<typeof getSettings>>): Promise<void> {
  const guild = member.guild;
  const ctx = {
    user: `<@${member.id}>`,
    username: member.user.username,
    server: guild.name,
    memberCount: guild.memberCount,
    position: guild.memberCount,
    createdTimestamp: member.user.createdTimestamp,
  };
  const description = welcomeText(settings.welcomeMessage, ctx);

  const embed = new EmbedBuilder()
    .setColor(ORANGE)
    .setTitle(`✨ أهلًا بك في ${guild.name}`)
    .setDescription(description)
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: '👤 العضو', value: `<@${member.id}>`, inline: true },
      { name: '📊 الترتيب', value: `#${guild.memberCount}`, inline: true },
      { name: '🕐 عمر الحساب', value: formatAccountAge(member.user.createdTimestamp), inline: true },
    )
    .setFooter({
      text: `${guild.name} · ${guild.memberCount} عضو`,
      iconURL: guild.iconURL({ size: 64 }) ?? undefined,
    })
    .setTimestamp();

  const banner = guild.bannerURL({ size: 1024 });
  if (banner) embed.setImage(banner);

  const files: AttachmentBuilder[] = [];
  if (settings.welcomeUseCard) {
    try {
      const buffer = await renderWelcomeCard({
        username: member.displayName,
        avatarUrl: member.user.displayAvatarURL({ extension: 'png', size: 256 }),
        position: guild.memberCount,
        serverName: guild.name,
        customBg: settings.welcomeCardBg,
        variant: 'welcome',
      });
      const att = new AttachmentBuilder(buffer, { name: 'welcome.png' });
      files.push(att);
      embed.setImage('attachment://welcome.png');
    } catch (err) {
      logger.warning(`welcome card render failed: ${err}`);
    }
  }

  const buttons = parseWelcomeButtons(settings.welcomeButtons);
  const row = buildButtonRow(buttons);
  const components = row ? [row] : [];

  const message = await channel
    .send({ content: `<@${member.id}>`, embeds: [embed], components, files, allowedMentions: { users: [member.id] } })
    .catch((err) => {
      logger.warning(`welcome send failed: ${err}`);
      return null;
    });

  // Optional: strip the @mention from the message after a delay (still pings on send, then cleans up).
  const delay = settings.welcomeMentionDeleteSeconds;
  if (message && delay > 0 && delay <= 60) {
    setTimeout(() => {
      message.edit({ content: '', allowedMentions: { parse: [] } }).catch(() => undefined);
    }, delay * 1000).unref();
  }
}
