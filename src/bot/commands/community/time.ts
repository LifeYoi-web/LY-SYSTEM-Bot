import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../../../db/prisma';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('time')
    .setDescription('التوقيت المحلي لعضو (يحتاج أن يكون قد ضبط /timezone)')
    .addUserOption((o) => o.setName('user').setDescription('العضو (افتراضيًا أنت)')),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    const user = interaction.options.getUser('user') ?? interaction.user;
    const profile = await prisma.profile.findUnique({
      where: { guildId_userId: { guildId: interaction.guild.id, userId: user.id } },
    });
    if (!profile?.timezone) {
      await interaction.reply({
        content:
          user.id === interaction.user.id
            ? '❌ لم تحدد منطقتك. استخدم `/timezone set`.'
            : `❌ <@${user.id}> لم يحدد منطقته بعد.`,
        allowedMentions: { parse: [] },
      });
      return;
    }
    const fmt = new Intl.DateTimeFormat('ar-SA', {
      timeZone: profile.timezone,
      dateStyle: 'full',
      timeStyle: 'short',
    });
    const embed = new EmbedBuilder()
      .setColor(0xf57c00)
      .setTitle(`🕒 توقيت ${user.username}`)
      .setDescription(`\`${profile.timezone}\``)
      .addFields({ name: 'الوقت المحلي', value: fmt.format(new Date()) });
    await interaction.reply({ embeds: [embed] });
  },
};
