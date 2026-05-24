import { SlashCommandBuilder, EmbedBuilder, time, type ChatInputCommandInteraction } from 'discord.js';

module.exports = {
  data: new SlashCommandBuilder().setName('serverinfo').setDescription('عرض معلومات السيرفر'),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!guild) return;
    const owner = await guild.fetchOwner().catch(() => null);

    const embed = new EmbedBuilder()
      .setColor(0xf57c00)
      .setTitle(`🏷️ ${guild.name}`)
      .setThumbnail(guild.iconURL({ size: 256 }))
      .addFields(
        { name: 'الأعضاء', value: guild.memberCount.toLocaleString('ar'), inline: true },
        { name: 'القنوات', value: String(guild.channels.cache.size), inline: true },
        { name: 'الرتب', value: String(guild.roles.cache.size), inline: true },
        { name: 'الإيموجي', value: String(guild.emojis.cache.size), inline: true },
        { name: 'البوستات', value: `Level ${guild.premiumTier} • ${guild.premiumSubscriptionCount ?? 0}`, inline: true },
        { name: 'المالك', value: owner ? `<@${owner.id}>` : '—', inline: true },
        { name: 'تاريخ الإنشاء', value: guild.createdAt ? time(guild.createdAt, 'D') : '—', inline: false },
      )
      .setFooter({ text: `ID: ${guild.id}` })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
