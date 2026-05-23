import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';

module.exports = {
  // تعريف شكل الأمر اللي يظهر في ديسكورد
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('يقيس سرعة استجابة البوت'),

  // الوظيفة اللي تشتغل لما يستخدم أحد الأمر
  async execute(interaction: ChatInputCommandInteraction) {
    const latency = interaction.client.ws.ping;

    // Embed هو الرسالة المنسقة الجميلة في ديسكورد
    const embed = new EmbedBuilder()
      .setColor(0xf57c00) // لون برتقالي يناسب شعار LY
      .setTitle('🏓 Pong!')
      .addFields(
        { name: 'سرعة البوت', value: `${latency}ms`, inline: true },
        { name: 'الحالة', value: latency < 100 ? '🟢 ممتاز' : latency < 200 ? '🟡 جيد' : '🔴 بطيء', inline: true }
      )
      .setFooter({ text: 'LY-SYSTEM Bot' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
