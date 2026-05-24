import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { prisma } from '../../../db/prisma';
import { banUser, type GuildLike } from '../../moderation/actions';
import { bump } from '../../stats';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('حظر عضو من السيرفر')
    .addUserOption((o) => o.setName('user').setDescription('العضو المراد حظره').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('سبب الحظر'))
    .addIntegerOption((o) =>
      o.setName('delete_days').setDescription('حذف رسائل آخر كم يوم (0-7)').setMinValue(0).setMaxValue(7),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guild) return;
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') ?? undefined;
    const days = interaction.options.getInteger('delete_days') ?? 0;
    await interaction.deferReply();
    try {
      await banUser(
        { guild: interaction.guild as unknown as GuildLike, prisma },
        {
          guildId: interaction.guild.id,
          targetUserId: user.id,
          moderatorId: interaction.user.id,
          reason,
          deleteMessageSeconds: days * 86_400,
        },
      );
      bump(interaction.guild.id, 'modActions');
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe5484d)
            .setTitle('⛔ تم الحظر')
            .setDescription(`تم حظر ${user}${reason ? `\n**السبب:** ${reason}` : ''}`)
            .setTimestamp(),
        ],
      });
    } catch {
      await interaction.editReply('❌ تعذّر تنفيذ الحظر — تأكد أن رتبة البوت أعلى من العضو وأن لديه صلاحية الحظر.');
    }
  },
};
