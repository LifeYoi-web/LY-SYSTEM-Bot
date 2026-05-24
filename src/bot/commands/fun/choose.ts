import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('choose')
    .setDescription('اختيار عشوائي بين خيارات (افصلها بفاصلة)')
    .addStringOption((o) => o.setName('options').setDescription('خيار1, خيار2, خيار3').setRequired(true)),

  async execute(interaction: ChatInputCommandInteraction) {
    const options = interaction.options
      .getString('options', true)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (options.length < 2) {
      await interaction.reply({ content: '❌ أعطني خيارين على الأقل مفصولين بفاصلة.' });
      return;
    }
    const pick = options[Math.floor(Math.random() * options.length)];
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xf57c00).setTitle('🤔 اخترت لك').setDescription(`**${pick}**`)],
    });
  },
};
