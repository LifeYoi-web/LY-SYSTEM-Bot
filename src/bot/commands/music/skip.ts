import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveControllable } from '../../music/interactions';

module.exports = {
  data: new SlashCommandBuilder().setName('skip').setDescription('تخطّي المقطع الحالي'),

  async execute(interaction: ChatInputCommandInteraction) {
    const player = await resolveControllable(interaction);
    if (!player) return;
    if (!player.queue.tracks.length) {
      await player.stopPlaying();
      await interaction.reply('⏭️ تخطّيت — ما فيه مقطع بعده، وقّفت التشغيل.');
      return;
    }
    await player.skip();
    await interaction.reply('⏭️ تخطّيت المقطع.');
  },
};
