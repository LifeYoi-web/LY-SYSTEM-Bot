import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { prisma } from '../../../db/prisma';
import { logEvent } from '../../logging';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('فك الحظر عن مستخدم عبر معرّفه (ID)')
    .addStringOption((o) => o.setName('user_id').setDescription('معرّف المستخدم').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('سبب فك الحظر'))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guild) return;
    const userId = interaction.options.getString('user_id', true).trim();
    const reason = interaction.options.getString('reason') ?? 'فك حظر يدوي';
    await interaction.deferReply();
    try {
      await interaction.guild.bans.remove(userId, reason);
      await prisma.moderationCase.updateMany({
        where: { guildId: interaction.guild.id, targetUserId: userId, type: 'ban', active: true },
        data: { active: false },
      });
      await logEvent({ client: interaction.client, prisma }, interaction.guild.id, 'mod_unban', {
        targetUserId: userId,
        moderatorId: interaction.user.id,
        reason,
      });
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x46a758)
            .setTitle('✅ تم فك الحظر')
            .setDescription(`تم فك الحظر عن \`${userId}\``)
            .setTimestamp(),
        ],
      });
    } catch {
      await interaction.editReply('❌ تعذّر فك الحظر — تأكد أن المعرّف صحيح وأن المستخدم محظور فعلًا.');
    }
  },
};
