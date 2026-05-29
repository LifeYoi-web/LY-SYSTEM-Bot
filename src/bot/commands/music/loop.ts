import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveControllable } from '../../music/interactions';
import { loopLabel, type LoopMode } from '../../music/player';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('loop')
    .setDescription('وضع التكرار')
    .addStringOption((o) =>
      o
        .setName('mode')
        .setDescription('إيقاف / المقطع / القائمة')
        .setRequired(true)
        .addChoices(
          { name: 'إيقاف', value: 'off' },
          { name: 'المقطع', value: 'track' },
          { name: 'القائمة', value: 'queue' },
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const player = await resolveControllable(interaction);
    if (!player) return;
    const mode = interaction.options.getString('mode', true) as LoopMode;
    await player.setRepeatMode(mode);
    await interaction.reply(`🔁 التكرار: **${loopLabel(mode)}**.`);
  },
};
