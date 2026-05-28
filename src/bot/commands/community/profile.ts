import { SlashCommandBuilder, EmbedBuilder, time, type ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../../../db/prisma';
import { progressInLevel } from '../../../shared/leveling';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('بطاقة عضو موحّدة (مستوى، نبذة، عقوبات، توقيت، ميلاد، AFK)')
    .addUserOption((o) => o.setName('user').setDescription('العضو (افتراضيًا أنت)')),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    const user = interaction.options.getUser('user') ?? interaction.user;
    const guildId = interaction.guild.id;
    const [lvl, profile, caseCount, member, afk, birthday, highlightCount] = await Promise.all([
      prisma.memberLevel.findUnique({ where: { guildId_userId: { guildId, userId: user.id } } }),
      prisma.profile.findUnique({ where: { guildId_userId: { guildId, userId: user.id } } }),
      prisma.moderationCase.count({ where: { guildId, targetUserId: user.id } }),
      interaction.guild.members.fetch(user.id).catch(() => null),
      prisma.afk.findUnique({ where: { guildId_userId: { guildId, userId: user.id } } }),
      prisma.birthday.findUnique({ where: { guildId_userId: { guildId, userId: user.id } } }),
      prisma.highlight.count({ where: { guildId, userId: user.id } }),
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
      { name: 'تنبيهات الكلمات', value: String(highlightCount), inline: true },
    );

    if (member?.joinedAt) embed.addFields({ name: 'انضمّ', value: time(member.joinedAt, 'R'), inline: true });
    if (birthday) embed.addFields({ name: '🎂 الميلاد', value: `${birthday.day}/${birthday.month}`, inline: true });
    if (profile?.timezone) {
      try {
        const fmt = new Intl.DateTimeFormat('ar-SA', { timeZone: profile.timezone, timeStyle: 'short' });
        embed.addFields({ name: '🕒 توقيته', value: `${fmt.format(new Date())} (${profile.timezone})`, inline: true });
      } catch {
        /* invalid stored timezone — skip the field */
      }
    }
    if (afk) {
      embed.addFields({
        name: '💤 AFK',
        value: `${afk.reason}\n<t:${Math.floor(afk.since.getTime() / 1000)}:R>`,
      });
    }

    await interaction.reply({ embeds: [embed] });
  },
};
