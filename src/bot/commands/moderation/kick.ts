import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { prisma } from '../../../db/prisma';
import { kickUser, type GuildLike } from '../../moderation/actions';
import { bump } from '../../stats';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('طرد عضو من السيرفر')
    .addUserOption((o) => o.setName('user').setDescription('العضو المراد طرده').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('سبب الطرد'))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guild) return;
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') ?? undefined;
    await interaction.deferReply();
    try {
      await kickUser(
        { guild: interaction.guild as unknown as GuildLike, prisma },
        { guildId: interaction.guild.id, targetUserId: user.id, moderatorId: interaction.user.id, reason },
      );
      bump(interaction.guild.id, 'modActions');
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xf0a020)
            .setTitle('👢 تم الطرد')
            .setDescription(`تم طرد ${user}${reason ? `\n**السبب:** ${reason}` : ''}`)
            .setTimestamp(),
        ],
      });
    } catch {
      await interaction.editReply('❌ تعذّر تنفيذ الطرد — تأكد من صلاحيات البوت وترتيب الرتب.');
    }
  },
};
