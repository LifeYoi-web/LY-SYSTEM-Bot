import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type TextChannel,
} from 'discord.js';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('ضبط الوضع البطيء للقناة الحالية')
    .addIntegerOption((o) =>
      o
        .setName('seconds')
        .setDescription('المهلة بين الرسائل بالثواني (0 لإيقافه)')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(21_600),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.channel?.isTextBased()) return;
    const seconds = interaction.options.getInteger('seconds', true);
    await interaction.deferReply();
    try {
      await (interaction.channel as TextChannel).setRateLimitPerUser(seconds);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xf57c00)
            .setTitle('🐌 الوضع البطيء')
            .setDescription(seconds === 0 ? 'تم إيقاف الوضع البطيء.' : `تم الضبط على **${seconds}** ثانية بين الرسائل.`),
        ],
      });
    } catch {
      await interaction.editReply('❌ تعذّر ضبط الوضع البطيء.');
    }
  },
};
