import { SlashCommandBuilder, EmbedBuilder, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { getMusicManager } from '../../music/manager';
import { fetchLyrics, paginateLyrics, currentTrackInfo } from '../../music/lyrics';

module.exports = {
  data: new SlashCommandBuilder().setName('lyrics').setDescription('كلمات المقطع الذي يشتغل الآن'),

  async execute(interaction: ChatInputCommandInteraction) {
    const mgr = getMusicManager();
    if (!mgr) {
      await interaction.reply({ content: '🎵 الموسيقى غير مفعّلة على البوت حالياً.', flags: MessageFlags.Ephemeral });
      return;
    }
    const player = interaction.guildId ? mgr.getPlayer(interaction.guildId) : undefined;
    const info = currentTrackInfo(player);
    if (!info) {
      await interaction.reply({ content: 'ما فيه شي يشتغل حالياً 🤷', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply();
    const res = await fetchLyrics(info.title, info.author);
    if (!res) {
      await interaction.editReply('📜 ما لقيت كلمات لهذا المقطع.');
      return;
    }
    const embeds = paginateLyrics(res.lyrics)
      .slice(0, 3)
      .map((p, i) => new EmbedBuilder().setColor(0xf57c00).setTitle(i === 0 ? `📜 ${res.title}` : '​').setDescription(p));
    await interaction.editReply({ embeds });
  },
};
