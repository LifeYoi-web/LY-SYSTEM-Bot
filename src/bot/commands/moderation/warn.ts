import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { prisma } from '../../../db/prisma';
import { warnUser, type GuildLike } from '../../moderation/actions';
import { bump } from '../../stats';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('توجيه تحذير لعضو وتسجيله')
    .addUserOption((o) => o.setName('user').setDescription('العضو').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('سبب التحذير').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guild) return;
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);
    await interaction.deferReply();
    await warnUser(
      { guild: interaction.guild as unknown as GuildLike, prisma },
      { guildId: interaction.guild.id, targetUserId: user.id, moderatorId: interaction.user.id, reason },
    );
    bump(interaction.guild.id, 'modActions');
    const count = await prisma.moderationCase.count({
      where: { guildId: interaction.guild.id, targetUserId: user.id, type: 'warn' },
    });
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xf57c00)
          .setTitle('⚠️ تم التحذير')
          .setDescription(`تم تحذير ${user}\n**السبب:** ${reason}\n**إجمالي تحذيراته:** ${count}`)
          .setTimestamp(),
      ],
    });
  },
};
