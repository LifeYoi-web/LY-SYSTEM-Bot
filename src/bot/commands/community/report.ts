import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type TextChannel,
} from 'discord.js';
import { prisma } from '../../../db/prisma';
import { getReportConfig } from '../../../db/community';
import { logEvent } from '../../logging';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('report')
    .setDescription('إبلاغ الإدارة عن عضو')
    .addUserOption((o) => o.setName('user').setDescription('العضو المُبلَّغ عنه').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('سبب البلاغ').setRequired(true)),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    const target = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true).slice(0, 1000);
    const cfg = await getReportConfig(interaction.guild.id);
    if (!cfg.channelId) {
      await interaction.reply({ content: '❌ نظام البلاغات غير مُعدّ. راجع الإدارة.', flags: MessageFlags.Ephemeral });
      return;
    }
    const channel = interaction.guild.channels.cache.get(cfg.channelId) as TextChannel | undefined;
    if (!channel?.isTextBased?.()) {
      await interaction.reply({ content: '❌ تعذّر إرسال البلاغ — قناة البلاغات غير صالحة. راجع الإدارة.', flags: MessageFlags.Ephemeral });
      return;
    }
    const embed = new EmbedBuilder()
      .setColor(0xf0494f)
      .setTitle('🚩 بلاغ جديد')
      .addFields(
        { name: 'المُبلِّغ', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'المُبلَّغ عنه', value: `<@${target.id}>`, inline: true },
        { name: 'السبب', value: reason },
      )
      .setTimestamp();
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => undefined);
    await logEvent({ client: interaction.client, prisma }, interaction.guild.id, 'report', {
      reporterId: interaction.user.id,
      targetId: target.id,
      reason,
    });
    await interaction.reply({ content: '✅ تم إرسال بلاغك للإدارة. شكرًا لك.', flags: MessageFlags.Ephemeral });
  },
};
