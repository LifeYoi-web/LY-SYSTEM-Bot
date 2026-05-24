import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../../../db/prisma';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tag')
    .setDescription('عرض محتوى محفوظ بالاسم')
    .addStringOption((o) => o.setName('name').setDescription('اسم التاج').setRequired(true)),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    const name = interaction.options.getString('name', true).trim().toLowerCase();
    const tag = await prisma.tag.findUnique({ where: { guildId_name: { guildId: interaction.guild.id, name } } });
    if (!tag) {
      await interaction.reply({ content: `❌ ما فيه تاج باسم \`${name}\`. جرّب \`/tags\`.` });
      return;
    }
    await prisma.tag.update({ where: { id: tag.id }, data: { uses: { increment: 1 } } }).catch(() => undefined);
    await interaction.reply({ content: tag.content, allowedMentions: { parse: [] } });
  },
};
