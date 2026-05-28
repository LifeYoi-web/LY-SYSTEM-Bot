import type { VoiceState } from 'discord.js';
import { prisma } from '../../db/prisma';
import { getTempVoiceConfig } from '../../db/community';
import { createTempChannel, handleTempLeave } from '../tempvoice';

module.exports = {
  name: 'voiceStateUpdate',
  once: false,
  async execute(oldState: VoiceState, newState: VoiceState) {
    // Mute/deafen/video toggles fire this event too — we only care about channel changes.
    if (oldState.channelId === newState.channelId) return;
    const guild = newState.guild ?? oldState.guild;
    if (!guild) return;

    // Joined the configured hub → create (or re-use) the member's temp channel.
    if (newState.channelId && newState.member) {
      const cfg = await getTempVoiceConfig(guild.id).catch(() => null);
      if (cfg?.enabled && cfg.hubChannelId === newState.channelId) {
        await createTempChannel(guild, prisma, cfg, newState.member);
      }
    }

    // Left a tracked temp channel → delete it if it's now empty.
    if (oldState.channelId) {
      await handleTempLeave(guild, prisma, oldState.channelId);
    }
  },
};
