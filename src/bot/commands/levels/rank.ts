import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../../../db/prisma';
import { progressInLevel } from '../../../shared/leveling';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('عرض مستواك أو مستوى عضو')
    .addUserOption((o) => o.setName('user').setDescription('العضو (افتراضيًا أنت)')),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    const user = interaction.options.getUser('user') ?? interaction.user;
    const row = await prisma.memberLevel.findUnique({
      where: { guildId_userId: { guildId: interaction.guild.id, userId: user.id } },
    });
    const xp = row?.xp ?? 0;
    const p = progressInLevel(xp);
    const rank = (await prisma.memberLevel.count({ where: { guildId: interaction.guild.id, xp: { gt: xp } } })) + 1;
    const filled = Math.round(p.pct / 10);
    const bar = '▰'.repeat(filled) + '▱'.repeat(10 - filled);

    const embed = new EmbedBuilder()
      .setColor(0xf57c00)
      .setTitle(`📊 مستوى ${user.username}`)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: 'المستوى', value: String(p.level), inline: true },
        { name: 'XP', value: `${p.into} / ${p.needed}`, inline: true },
        { name: 'الترتيب', value: `#${rank}`, inline: true },
        { name: '​', value: `${bar} ${p.pct}%` },
      )
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
