import { EmbedBuilder, MessageFlags, type ButtonInteraction } from 'discord.js';
import { resolveControllable, musicReply } from './interactions';
import { nextLoopMode, loopLabel, type LoopMode } from './player';
import { getMusicManager } from './manager';
import { fetchLyrics, paginateLyrics, currentTrackInfo } from './lyrics';

const ORANGE = 0xf57c00;

/** 📜 lyrics — read-only, so it skips the "must be in voice" control guard. */
async function handleLyricsButton(interaction: ButtonInteraction): Promise<void> {
  const mgr = getMusicManager();
  const player = mgr && interaction.guildId ? mgr.getPlayer(interaction.guildId) : undefined;
  const info = currentTrackInfo(player);
  if (!info) {
    await interaction.reply({ content: 'ما فيه شي يشتغل حالياً 🤷', flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const res = await fetchLyrics(info.title, info.author);
  if (!res) {
    await interaction.editReply('📜 ما لقيت كلمات لهذا المقطع.');
    return;
  }
  const embeds = paginateLyrics(res.lyrics)
    .slice(0, 3)
    .map((p, i) => new EmbedBuilder().setColor(ORANGE).setTitle(i === 0 ? `📜 ${res.title}` : '​').setDescription(p));
  await interaction.editReply({ embeds });
}

/** Handle the now-playing control buttons (customId prefix `mu:`). */
export async function handleMusicButton(interaction: ButtonInteraction): Promise<void> {
  const action = interaction.customId.slice(3); // strip "mu:"
  if (action === 'lyrics') {
    await handleLyricsButton(interaction);
    return;
  }
  const player = await resolveControllable(interaction);
  if (!player) return;

  switch (action) {
    case 'toggle': {
      if (player.paused) await player.resume();
      else await player.pause();
      await musicReply(interaction, player.paused ? '⏸️ تم الإيقاف المؤقت.' : '▶️ تم استئناف التشغيل.');
      return;
    }
    case 'skip': {
      if (!player.queue.tracks.length) {
        await player.stopPlaying();
        await musicReply(interaction, '⏭️ تخطّيت — ما فيه مقطع بعده، وقّفت التشغيل.');
        return;
      }
      await player.skip();
      await musicReply(interaction, '⏭️ تخطّيت المقطع.');
      return;
    }
    case 'stop': {
      await player.destroy('Stopped via button');
      await musicReply(interaction, '⏹️ وقّفت التشغيل وطلعت من الروم.');
      return;
    }
    case 'loop': {
      const next = nextLoopMode(player.repeatMode as LoopMode);
      await player.setRepeatMode(next);
      await musicReply(interaction, `🔁 التكرار: ${loopLabel(next)}`);
      return;
    }
    case 'shuffle': {
      await player.queue.shuffle();
      await musicReply(interaction, '🔀 خلطت القائمة.');
      return;
    }
  }
}
