import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveControllable } from '../../music/interactions';

module.exports = {
  data: new SlashCommandBuilder().setName('disconnect').setDescription('إخراج البوت من الروم الصوتي'),

  async execute(interaction: ChatInputCommandInteraction) {
    const player = await resolveControllable(interaction);
    if (!player) return;
    await player.destroy('Disconnected via /disconnect');
    await interaction.reply('👋 طلعت من الروم.');
  },
};
