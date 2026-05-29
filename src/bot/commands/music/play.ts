import {
  SlashCommandBuilder,
  MessageFlags,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { getMusicManager } from '../../music/manager';
import { memberVoiceChannelId } from '../../music/interactions';
import { formatDuration, type TrackLike } from '../../music/player';

const ORANGE = 0xf57c00;
const EPH = { flags: MessageFlags.Ephemeral } as const;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('شغّل أغنية من يوتيوب (رابط أو بحث)')
    .addStringOption((o) => o.setName('query').setDescription('رابط يوتيوب/قائمة تشغيل أو اسم الأغنية').setRequired(true)),

  async execute(interaction: ChatInputCommandInteraction) {
    const mgr = getMusicManager();
    if (!mgr) {
      await interaction.reply({ content: '🎵 الموسيقى غير مفعّلة على البوت حالياً.', ...EPH });
      return;
    }
    if (!interaction.guild) {
      await interaction.reply({ content: 'هذا الأمر داخل السيرفر فقط.', ...EPH });
      return;
    }
    const vc = await memberVoiceChannelId(interaction);
    if (!vc) {
      await interaction.reply({ content: 'ادخل روم صوتي أول 🎙️', ...EPH });
      return;
    }

    const query = interaction.options.getString('query', true);
    await interaction.deferReply();

    try {
      const existing = mgr.getPlayer(interaction.guild.id);
      const player =
        existing ??
        mgr.createPlayer({
          guildId: interaction.guild.id,
          voiceChannelId: vc,
          textChannelId: interaction.channelId,
          selfDeaf: true,
          volume: 100,
        });
      if (!existing) await player.connect();
      if (player.voiceChannelId !== vc) {
        await interaction.editReply('لازم تكون بنفس الروم الصوتي مع البوت.');
        return;
      }

      const isUrl = /^https?:\/\//i.test(query.trim());
      const res = await player.search(
        isUrl ? { query } : { query, source: 'youtube' },
        { id: interaction.user.id, username: interaction.user.username },
      );
      if (!res || !res.tracks?.length) {
        await interaction.editReply('ما لقيت نتيجة 🔍');
        return;
      }

      const isPlaylist = res.loadType === 'playlist';
      if (isPlaylist) await player.queue.add(res.tracks);
      else await player.queue.add(res.tracks[0]);
      if (!player.playing && !player.paused) await player.play();

      const embed = new EmbedBuilder().setColor(ORANGE);
      if (isPlaylist) {
        embed
          .setAuthor({ name: '➕ أُضيفت قائمة تشغيل' })
          .setTitle((res.playlist?.name ?? 'قائمة تشغيل').slice(0, 256))
          .setDescription(`أُضيف **${res.tracks.length}** مقطع للقائمة.`);
      } else {
        const t = res.tracks[0] as unknown as TrackLike;
        embed
          .setAuthor({ name: '➕ أُضيف للقائمة' })
          .setTitle(t.info.title.slice(0, 256))
          .setURL(t.info.uri)
          .addFields({ name: 'المدة', value: formatDuration(t.info.duration, t.info.isStream), inline: true });
        if (t.info.artworkUrl) embed.setThumbnail(t.info.artworkUrl);
      }
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply('❌ تعذّر التشغيل — تأكد أن خدمة الموسيقى (Lavalink) متصلة.');
    }
  },
};
