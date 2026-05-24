import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { prisma } from '../../../db/prisma';
import { muteUser, type GuildLike } from '../../moderation/actions';
import { bump } from '../../stats';

const MAX_MINUTES = 40_320; // 28 days

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('كتم عضو لمدة محددة (timeout)')
    .addUserOption((o) => o.setName('user').setDescription('العضو').setRequired(true))
    .addIntegerOption((o) =>
      o.setName('minutes').setDescription('المدة بالدقائق').setRequired(true).setMinValue(1).setMaxValue(MAX_MINUTES),
    )
    .addStringOption((o) => o.setName('reason').setDescription('سبب الكتم'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guild) return;
    const user = interaction.options.getUser('user', true);
    const minutes = interaction.options.getInteger('minutes', true);
    const reason = interaction.options.getString('reason') ?? undefined;
    await interaction.deferReply();
    try {
      await muteUser(
        { guild: interaction.guild as unknown as GuildLike, prisma },
        {
          guildId: interaction.guild.id,
          targetUserId: user.id,
          moderatorId: interaction.user.id,
          reason,
          seconds: minutes * 60,
        },
      );
      bump(interaction.guild.id, 'modActions');
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5b9bf3)
            .setTitle('🔇 تم الكتم')
            .setDescription(`تم كتم ${user} لمدة **${minutes}** دقيقة${reason ? `\n**السبب:** ${reason}` : ''}`)
            .setTimestamp(),
        ],
      });
    } catch {
      await interaction.editReply('❌ تعذّر الكتم — تأكد من صلاحية «إدارة الأعضاء» وترتيب الرتب.');
    }
  },
};
