import { SlashCommandBuilder, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { getMusicManager } from '../../music/manager';
import { buildNowPlaying, type TrackLike } from '../../music/player';

module.exports = {
  data: new SlashCommandBuilder().setName('nowplaying').setDescription('المقطع اللي يشتغل الآن'),

  async execute(interaction: ChatInputCommandInteraction) {
    const mgr = getMusicManager();
    if (!mgr) {
      await interaction.reply({ content: '🎵 الموسيقى غير مفعّلة على البوت حالياً.', flags: MessageFlags.Ephemeral });
      return;
    }
    const player = interaction.guildId ? mgr.getPlayer(interaction.guildId) : undefined;
    if (!player || !player.queue.current) {
      await interaction.reply({ content: 'ما فيه شي يشتغل حالياً 🤷', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply(
      buildNowPlaying(player.queue.current as unknown as TrackLike, {
        volume: player.volume,
        repeatMode: player.repeatMode,
        paused: player.paused,
      }),
    );
  },
};
