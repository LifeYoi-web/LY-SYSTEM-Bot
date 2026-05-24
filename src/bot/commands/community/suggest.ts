import { SlashCommandBuilder, MessageFlags, type ChatInputCommandInteraction, type TextChannel } from 'discord.js';
import { prisma } from '../../../db/prisma';
import { getSuggestionConfig } from '../../../db/community';
import { buildSuggestionMessage } from '../../suggestions';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('suggest')
    .setDescription('إرسال اقتراح للسيرفر')
    .addStringOption((o) => o.setName('idea').setDescription('اقتراحك').setRequired(true)),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    const content = interaction.options.getString('idea', true).slice(0, 1000);
    const cfg = await getSuggestionConfig(interaction.guild.id);
    if (!cfg.enabled || !cfg.channelId) {
      await interaction.reply({ content: '❌ نظام الاقتراحات غير مفعّل في هذا السيرفر.', flags: MessageFlags.Ephemeral });
      return;
    }
    const channel = interaction.guild.channels.cache.get(cfg.channelId) as TextChannel | undefined;
    if (!channel?.isTextBased?.()) {
      await interaction.reply({ content: '❌ قناة الاقتراحات غير صالحة.', flags: MessageFlags.Ephemeral });
      return;
    }
    const suggestion = await prisma.suggestion.create({
      data: { guildId: interaction.guild.id, channelId: cfg.channelId, authorId: interaction.user.id, content },
    });
    const msg = await channel.send(buildSuggestionMessage(suggestion)).catch(() => null);
    if (msg) await prisma.suggestion.update({ where: { id: suggestion.id }, data: { messageId: msg.id } });
    await interaction.reply({ content: '✅ تم إرسال اقتراحك، شكرًا لك!', flags: MessageFlags.Ephemeral });
  },
};
