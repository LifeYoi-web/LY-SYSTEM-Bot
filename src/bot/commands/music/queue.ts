import { SlashCommandBuilder, MessageFlags, EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { getMusicManager } from '../../music/manager';
import { queueLines, formatDuration, type TrackLike } from '../../music/player';

const ORANGE = 0xf57c00;
const EPH = { flags: MessageFlags.Ephemeral } as const;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('عرض قائمة التشغيل')
    .addIntegerOption((o) => o.setName('page').setDescription('رقم الصفحة').setMinValue(1)),

  async execute(interaction: ChatInputCommandInteraction) {
    const mgr = getMusicManager();
    if (!mgr) {
      await interaction.reply({ content: '🎵 الموسيقى غير مفعّلة على البوت حالياً.', ...EPH });
      return;
    }
    const player = interaction.guildId ? mgr.getPlayer(interaction.guildId) : undefined;
    if (!player || !player.queue.current) {
      await interaction.reply({ content: 'ما فيه شي يشتغل حالياً 🤷', ...EPH });
      return;
    }
    const tracks = player.queue.tracks as unknown as TrackLike[];
    const { lines, totalPages, page } = queueLines(tracks, (interaction.options.getInteger('page') ?? 1) - 1);
    const cur = player.queue.current as unknown as TrackLike;
    const embed = new EmbedBuilder()
      .setColor(ORANGE)
      .setTitle('🎶 قائمة التشغيل')
      .setDescription(
        `**يشتغل الآن:** [${cur.info.title.slice(0, 60)}](${cur.info.uri}) \`${formatDuration(cur.info.duration, cur.info.isStream)}\`\n\n` +
          (lines.length ? lines.join('\n') : '_القائمة فاضية_'),
      )
      .setFooter({ text: `صفحة ${page + 1}/${totalPages} · ${tracks.length} في الانتظار · الصوت ${player.volume}%` });
    await interaction.reply({ embeds: [embed] });
  },
};
