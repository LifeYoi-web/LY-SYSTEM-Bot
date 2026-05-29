import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveControllable } from '../../music/interactions';

module.exports = {
  data: new SlashCommandBuilder().setName('stop').setDescription('إيقاف التشغيل ومسح القائمة والخروج من الروم'),

  async execute(interaction: ChatInputCommandInteraction) {
    const player = await resolveControllable(interaction);
    if (!player) return;
    await player.destroy('Stopped via /stop');
    await interaction.reply('⏹️ وقّفت التشغيل، مسحت القائمة، وطلعت من الروم.');
  },
};
