import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveControllable } from '../../music/interactions';

module.exports = {
  data: new SlashCommandBuilder().setName('shuffle').setDescription('خلط ترتيب القائمة'),

  async execute(interaction: ChatInputCommandInteraction) {
    const player = await resolveControllable(interaction);
    if (!player) return;
    if (player.queue.tracks.length < 2) {
      await interaction.reply('🔀 القائمة قصيرة على الخلط.');
      return;
    }
    await player.queue.shuffle();
    await interaction.reply('🔀 خلطت القائمة.');
  },
};
