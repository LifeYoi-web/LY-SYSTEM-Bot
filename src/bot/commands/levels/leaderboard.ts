import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../../../db/prisma';

module.exports = {
  data: new SlashCommandBuilder().setName('leaderboard').setDescription('أفضل ١٠ أعضاء بالمستويات'),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    const rows = await prisma.memberLevel.findMany({
      where: { guildId: interaction.guild.id },
      orderBy: { xp: 'desc' },
      take: 10,
    });
    if (rows.length === 0) {
      await interaction.reply('ما فيه بيانات مستويات بعد — خلّ الأعضاء يتفاعلون أول! 💬');
      return;
    }
    const medals = ['🥇', '🥈', '🥉'];
    const desc = rows
      .map((r, i) => `${medals[i] ?? `**${i + 1}.**`} <@${r.userId}> — المستوى **${r.level}** • ${r.xp} XP`)
      .join('\n');
    const embed = new EmbedBuilder()
      .setColor(0xf57c00)
      .setTitle('🏆 متصدّرو السيرفر')
      .setDescription(desc)
      .setTimestamp();
    await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};
