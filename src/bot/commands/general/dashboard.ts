import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type ChatInputCommandInteraction,
} from 'discord.js';

module.exports = {
  data: new SlashCommandBuilder().setName('dashboard').setDescription('رابط لوحة تحكم LY-SYSTEM'),

  async execute(interaction: ChatInputCommandInteraction) {
    const url = process.env.DASHBOARD_URL || 'https://discord.com';
    const embed = new EmbedBuilder()
      .setColor(0xf57c00)
      .setTitle('🎛️ لوحة تحكم LY-SYSTEM')
      .setDescription('تحكّم كامل بالسيرفر من المتصفح: إحصائيات، إشراف، حماية تلقائية، سجلّات، وأكثر.')
      .setTimestamp();
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setLabel('افتح اللوحة').setStyle(ButtonStyle.Link).setURL(url),
    );
    await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
  },
};
