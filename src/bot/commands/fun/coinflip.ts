import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';

module.exports = {
  data: new SlashCommandBuilder().setName('coinflip').setDescription('رمي عملة (صورة أو كتابة)'),

  async execute(interaction: ChatInputCommandInteraction) {
    const heads = Math.random() < 0.5;
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xf57c00)
          .setTitle('🪙 رمي العملة')
          .setDescription(`طلعت **${heads ? 'صورة 👑' : 'كتابة ✍️'}**`),
      ],
    });
  },
};
