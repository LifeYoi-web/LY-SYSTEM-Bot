import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveControllable } from '../../music/interactions';

module.exports = {
  data: new SlashCommandBuilder().setName('pause').setDescription('إيقاف التشغيل مؤقتًا'),

  async execute(interaction: ChatInputCommandInteraction) {
    const player = await resolveControllable(interaction);
    if (!player) return;
    if (player.paused) {
      await interaction.reply('⏸️ التشغيل متوقف مؤقتًا بالفعل.');
      return;
    }
    await player.pause();
    await interaction.reply('⏸️ تم الإيقاف المؤقت — استخدم /resume للاستئناف.');
  },
};
