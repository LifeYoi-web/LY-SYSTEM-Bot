import { SlashCommandBuilder, EmbedBuilder, time, type ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../../../db/prisma';
import { progressInLevel } from '../../../shared/leveling';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('عرض ملف عضو (مستوى، نبذة، عقوبات)')
    .addUserOption((o) => o.setName('user').setDescription('العضو (افتراضيًا أنت)')),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    const user = interaction.options.getUser('user') ?? interaction.user;
    const guildId = interaction.guild.id;
    const [lvl, profile, caseCount, member] = await Promise.all([
      prisma.memberLevel.findUnique({ where: { guildId_userId: { guildId, userId: user.id } } }),
      prisma.profile.findUnique({ where: { guildId_userId: { guildId, userId: user.id } } }),
      prisma.moderationCase.count({ where: { guildId, targetUserId: user.id } }),
      interaction.guild.members.fetch(user.id).catch(() => null),
    ]);
    const p = progressInLevel(lvl?.xp ?? 0);

    const embed = new EmbedBuilder()
      .setColor(member?.displayColor || 0xf57c00)
      .setTitle(`👤 ${user.username}`)
      .setThumbnail(user.displayAvatarURL({ size: 256 }));
    if (profile?.bio) embed.setDescription(profile.bio);
    embed.addFields(
      { name: 'المستوى', value: `${p.level} • ${p.into}/${p.needed} XP`, inline: true },
      { name: 'العقوبات', value: String(caseCount), inline: true },
    );
    if (member?.joinedAt) embed.addFields({ name: 'انضمّ', value: time(member.joinedAt, 'R'), inline: true });
    await interaction.reply({ embeds: [embed] });
  },
};
