import { SlashCommandBuilder, EmbedBuilder, time, type ChatInputCommandInteraction } from 'discord.js';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('عرض معلومات عضو')
    .addUserOption((o) => o.setName('user').setDescription('العضو (افتراضيًا أنت)')),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    const user = interaction.options.getUser('user') ?? interaction.user;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    const roles = member
      ? [...member.roles.cache.values()].filter((r) => r.id !== interaction.guild!.id).sort((a, b) => b.position - a.position)
      : [];

    const embed = new EmbedBuilder()
      .setColor(member?.displayColor || 0xf57c00)
      .setTitle(`👤 ${user.username}`)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'المعرّف', value: `\`${user.id}\``, inline: true },
        { name: 'بوت؟', value: user.bot ? 'نعم 🤖' : 'لا', inline: true },
        { name: 'تاريخ الإنشاء', value: time(user.createdAt, 'R'), inline: true },
      );
    if (member?.joinedAt) embed.addFields({ name: 'انضم في', value: time(member.joinedAt, 'R'), inline: true });
    if (roles.length) {
      embed.addFields({
        name: `الرتب (${roles.length})`,
        value: roles.slice(0, 10).map((r) => `<@&${r.id}>`).join(' ') || '—',
      });
    }
    embed.setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
