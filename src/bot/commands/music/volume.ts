import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveControllable } from '../../music/interactions';
import { coerceVolume } from '../../music/player';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('ضبط مستوى الصوت (0-150)')
    .addIntegerOption((o) => o.setName('level').setDescription('من 0 إلى 150').setRequired(true).setMinValue(0).setMaxValue(150)),

  async execute(interaction: ChatInputCommandInteraction) {
    const player = await resolveControllable(interaction);
    if (!player) return;
    const level = coerceVolume(interaction.options.getInteger('level', true));
    if (level === null) {
      await interaction.reply('❌ قيمة غير صحيحة.');
      return;
    }
    await player.setVolume(level);
    await interaction.reply(`🔊 الصوت الآن **${level}%**.`);
  },
};
