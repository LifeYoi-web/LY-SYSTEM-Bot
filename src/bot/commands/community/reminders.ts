import { SlashCommandBuilder, EmbedBuilder, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../../../db/prisma';

module.exports = {
  data: new SlashCommandBuilder().setName('reminders').setDescription('عرض تذكيراتك القادمة'),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    const items = await prisma.reminder.findMany({
      where: { guildId: interaction.guild.id, userId: interaction.user.id },
      orderBy: { remindAt: 'asc' },
      take: 15,
    });
    if (items.length === 0) {
      await interaction.reply({ content: 'ما عندك تذكيرات قادمة. استخدم `/remind`.', flags: MessageFlags.Ephemeral });
      return;
    }
    const embed = new EmbedBuilder()
      .setColor(0xf57c00)
      .setTitle('⏰ تذكيراتك')
      .setDescription(items.map((r) => `• <t:${Math.floor(r.remindAt.getTime() / 1000)}:R> — ${r.content}`).join('\n'));
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
