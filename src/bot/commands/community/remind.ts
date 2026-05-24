import { SlashCommandBuilder, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../../../db/prisma';
import { parseDuration } from '../../../shared/duration';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remind')
    .setDescription('ذكّرني بشيء بعد مدة')
    .addStringOption((o) => o.setName('duration').setDescription('مثل 10m أو 2h أو 1d').setRequired(true))
    .addStringOption((o) => o.setName('text').setDescription('بماذا أذكّرك؟').setRequired(true)),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    const ms = parseDuration(interaction.options.getString('duration', true));
    if (ms == null) {
      await interaction.reply({ content: '❌ صيغة المدة غير صحيحة. مثال: 10m / 2h / 1d', flags: MessageFlags.Ephemeral });
      return;
    }
    const content = interaction.options.getString('text', true).slice(0, 500);
    const remindAt = new Date(Date.now() + ms);
    await prisma.reminder.create({
      data: { guildId: interaction.guild.id, userId: interaction.user.id, channelId: interaction.channelId, content, remindAt },
    });
    await interaction.reply({
      content: `⏰ تمام، بذكّرك <t:${Math.floor(remindAt.getTime() / 1000)}:R> بـ: ${content}`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
