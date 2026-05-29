import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveControllable } from '../../music/interactions';

module.exports = {
  data: new SlashCommandBuilder().setName('resume').setDescription('استئناف التشغيل بعد الإيقاف المؤقت'),

  async execute(interaction: ChatInputCommandInteraction) {
    const player = await resolveControllable(interaction);
    if (!player) return;
    if (!player.paused) {
      await interaction.reply('▶️ التشغيل شغّال بالفعل.');
      return;
    }
    await player.resume();
    await interaction.reply('▶️ تم استئناف التشغيل.');
  },
};
