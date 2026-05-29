import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveControllable } from '../../music/interactions';
import { parseSeek, formatDuration, type TrackLike } from '../../music/player';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('seek')
    .setDescription('الانتقال إلى وقت معيّن في المقطع')
    .addStringOption((o) => o.setName('time').setDescription('مثل 90 أو 1:30 أو 1m30s').setRequired(true)),

  async execute(interaction: ChatInputCommandInteraction) {
    const player = await resolveControllable(interaction);
    if (!player) return;
    const current = player.queue.current as unknown as TrackLike | null;
    if (!current) {
      await interaction.reply('ما فيه مقطع يشتغل.');
      return;
    }
    if (current.info.isStream) {
      await interaction.reply('❌ ما يصير تتنقّل داخل بث مباشر.');
      return;
    }
    const ms = parseSeek(interaction.options.getString('time', true));
    if (ms === null) {
      await interaction.reply('❌ صيغة الوقت غير صحيحة. مثال: 90 / 1:30 / 1m30s');
      return;
    }
    if (ms > current.info.duration) {
      await interaction.reply('❌ الوقت أطول من مدة المقطع.');
      return;
    }
    await player.seek(ms);
    await interaction.reply(`⏩ انتقلت إلى **${formatDuration(ms)}**.`);
  },
};
