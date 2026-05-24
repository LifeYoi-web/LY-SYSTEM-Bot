import { SlashCommandBuilder, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../../../db/prisma';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('birthday')
    .setDescription('إدارة تاريخ ميلادك')
    .addSubcommand((s) =>
      s
        .setName('set')
        .setDescription('تعيين تاريخ ميلادك')
        .addIntegerOption((o) => o.setName('day').setDescription('اليوم (1-31)').setRequired(true).setMinValue(1).setMaxValue(31))
        .addIntegerOption((o) => o.setName('month').setDescription('الشهر (1-12)').setRequired(true).setMinValue(1).setMaxValue(12)),
    )
    .addSubcommand((s) => s.setName('remove').setDescription('حذف تاريخ ميلادك')),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    if (interaction.options.getSubcommand() === 'remove') {
      await prisma.birthday.delete({ where: { guildId_userId: { guildId, userId } } }).catch(() => undefined);
      await interaction.reply({ content: '🗑️ تم حذف تاريخ ميلادك.', flags: MessageFlags.Ephemeral });
      return;
    }
    const day = interaction.options.getInteger('day', true);
    const month = interaction.options.getInteger('month', true);
    if (day > [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]) {
      await interaction.reply({ content: '❌ هذا اليوم غير موجود في هذا الشهر.', flags: MessageFlags.Ephemeral });
      return;
    }
    await prisma.birthday.upsert({
      where: { guildId_userId: { guildId, userId } },
      create: { guildId, userId, day, month },
      update: { day, month },
    });
    await interaction.reply({ content: `🎂 تم تسجيل ميلادك في ${day}/${month}!`, flags: MessageFlags.Ephemeral });
  },
};
