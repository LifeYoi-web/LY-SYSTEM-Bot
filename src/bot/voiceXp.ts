import type { Client } from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import { getLevelConfig } from '../db/leveling';
import { applyXpGain } from './leveling';

// The scheduler calls this each tick (~60s). We credit each eligible voice member XP
// pro-rated to the elapsed time since the last sweep, so partial minutes still count
// and a missed/long tick (e.g. after a restart) is skipped rather than dumping XP.
let lastSweep = 0;

export async function sweepVoiceXp(
  client: Client,
  prisma: PrismaClient,
  guildId: string,
  now: number = Date.now(),
): Promise<number> {
  const cfg = await getLevelConfig(guildId);
  const prev = lastSweep;
  lastSweep = now;
  if (!cfg.enabled || !cfg.voiceXpEnabled) return 0;
  if (!prev) return 0; // first run establishes the baseline
  const elapsedMin = (now - prev) / 60_000;
  if (elapsedMin <= 0 || elapsedMin > 10) return 0; // skip long gaps (restart, clock jump)

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return 0;
  let credited = 0;
  for (const channel of guild.channels.cache.values()) {
    if (!channel.isVoiceBased?.()) continue;
    if (cfg.ignoredVoiceChannelIds.includes(channel.id)) continue;
    if (guild.afkChannelId && channel.id === guild.afkChannelId) continue;
    const humans = [...channel.members.values()].filter((m) => !m.user.bot);
    if (humans.length < 2) continue; // talking to yourself doesn't count
    for (const m of humans) {
      const vs = m.voice;
      if (vs.selfMute || vs.mute || vs.suppress) continue; // must be actually able to talk
      const gain = Math.round(cfg.voiceXpPerMinute * elapsedMin * cfg.multiplier);
      if (gain <= 0) continue;
      await applyXpGain(prisma, guildId, m.id, m, cfg, gain).catch(() => undefined);
      credited++;
    }
  }
  return credited;
}

export function _resetVoiceSweep(): void {
  lastSweep = 0;
}
