import { SlashCommandBuilder, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../../../db/prisma';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setbio')
    .setDescription('تعيين نبذة تظهر في ملفك')
    .addStringOption((o) => o.setName('bio').setDescription('النبذة').setRequired(true)),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    const bio = interaction.options.getString('bio', true).slice(0, 300);
    await prisma.profile.upsert({
      where: { guildId_userId: { guildId: interaction.guild.id, userId: interaction.user.id } },
      create: { guildId: interaction.guild.id, userId: interaction.user.id, bio },
      update: { bio },
    });
    await interaction.reply({ content: '✅ تم تحديث نبذتك.', flags: MessageFlags.Ephemeral });
  },
};
