import type { ButtonInteraction } from 'discord.js';
import { resolveControllable, musicReply } from './interactions';
import { nextLoopMode, loopLabel, type LoopMode } from './player';

/** Handle the now-playing control buttons (customId prefix `mu:`). */
export async function handleMusicButton(interaction: ButtonInteraction): Promise<void> {
  const action = interaction.customId.slice(3); // strip "mu:"
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
