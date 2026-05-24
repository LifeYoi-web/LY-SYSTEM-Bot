import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dice')
    .setDescription('رمي نرد')
    .addIntegerOption((o) => o.setName('sides').setDescription('عدد الأوجه (افتراضي 6)').setMinValue(2).setMaxValue(1000)),

  async execute(interaction: ChatInputCommandInteraction) {
    const sides = interaction.options.getInteger('sides') ?? 6;
    const roll = Math.floor(Math.random() * sides) + 1;
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xf57c00).setTitle('🎲 النرد').setDescription(`طلع لك **${roll}** من **${sides}**`)],
    });
  },
};
