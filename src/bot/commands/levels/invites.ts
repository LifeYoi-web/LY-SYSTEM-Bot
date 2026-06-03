import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../../../db/prisma';
import { getInviteConfig } from '../../../db/community';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('invites')
    .setDescription('دعواتك أو لوحة الداعين')
    .addUserOption((o) => o.setName('user').setDescription('العضو (افتراضيًا أنت)')),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    const cfg = await getInviteConfig(interaction.guild.id);
    if (!cfg.enabled) {
      await interaction.reply('تتبّع الدعوات غير مفعّل في هذا السيرفر.');
      return;
    }
    const user = interaction.options.getUser('user') ?? interaction.user;
    const [stat, top] = await Promise.all([
      prisma.inviteStat.findUnique({ where: { guildId_userId: { guildId: interaction.guild.id, userId: user.id } } }),
      prisma.inviteStat.findMany({ where: { guildId: interaction.guild.id }, orderBy: { regular: 'desc' }, take: 10 }),
    ]);
    const medals = ['🥇', '🥈', '🥉'];
    const embed = new EmbedBuilder()
      .setColor(0xf57c00)
      .setTitle('📨 الدعوات')
      .setDescription(
        `دعوات <@${user.id}>: **${stat?.regular ?? 0}** صالحة · ${stat?.fake ?? 0} وهمية · ${stat?.left ?? 0} غادروا`,
      )
      .addFields({
        name: '🏆 لوحة الداعين',
        value: top.length ? top.map((t, i) => `${medals[i] ?? `**${i + 1}.**`} <@${t.userId}> — ${t.regular}`).join('\n') : '—',
      });
    await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};
