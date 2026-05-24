import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../../../db/prisma';

module.exports = {
  data: new SlashCommandBuilder().setName('tags').setDescription('عرض كل التاجات المتاحة'),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    const tags = await prisma.tag.findMany({ where: { guildId: interaction.guild.id }, orderBy: { name: 'asc' } });
    const embed = new EmbedBuilder()
      .setColor(0xf57c00)
      .setTitle('🏷️ التاجات المتاحة')
      .setDescription(tags.length ? tags.map((t) => `\`${t.name}\``).join('  •  ') : 'ما فيه تاجات بعد.');
    await interaction.reply({ embeds: [embed] });
  },
};
