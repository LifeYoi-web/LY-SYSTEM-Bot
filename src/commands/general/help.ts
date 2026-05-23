import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('يعرض قائمة جميع الأوامر المتاحة'),

  async execute(interaction: ChatInputCommandInteraction) {
    const embed = new EmbedBuilder()
      .setColor(0xf57c00)
      .setTitle('📋 قائمة الأوامر - LY-SYSTEM')
      .setDescription('هذي جميع الأوامر المتاحة في البوت')
      .addFields(
        { name: '/ping', value: 'يقيس سرعة استجابة البوت', inline: false },
        { name: '/help', value: 'يعرض هذه القائمة', inline: false }
      )
      .setThumbnail(interaction.client.user?.displayAvatarURL() || '')
      .setFooter({ text: 'LY-SYSTEM Bot • طوّرت بـ TypeScript' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
