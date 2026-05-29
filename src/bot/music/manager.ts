import { LavalinkManager } from 'lavalink-client';
import type { Client, TextChannel } from 'discord.js';
import type { AppConfig } from '../../shared/config';
import { logger } from '../../shared/logger';
import { buildNowPlaying, type TrackLike } from './player';

/** 5-min idle auto-disconnect after the queue empties. */
const IDLE_DISCONNECT_MS = 5 * 60_000;

let manager: LavalinkManager | null = null;

export function getMusicManager(): LavalinkManager | null {
  return manager;
}

/**
 * Build the Lavalink manager IF an external node is configured. When LAVALINK_HOST/PASSWORD
 * are absent the feature is disabled (returns null) — music commands then reply politely and
 * boot is never affected. Node connection happens later, in the `ready` event via init().
 */
export function initMusicManager(client: Client, cfg: AppConfig): LavalinkManager | null {
  if (manager) return manager;
  if (!cfg.lavalinkHost || !cfg.lavalinkPassword) {
    logger.info('Music: LAVALINK_* not configured — music feature disabled.');
    return null;
  }

  manager = new LavalinkManager({
    nodes: [
      {
        id: 'main',
        host: cfg.lavalinkHost,
        port: cfg.lavalinkPort ?? 2333,
        authorization: cfg.lavalinkPassword,
        secure: cfg.lavalinkSecure ?? false,
      },
    ],
    sendToShard: (guildId, payload) => client.guilds.cache.get(guildId)?.shard?.send(payload),
    autoSkip: true,
    playerOptions: {
      defaultSearchPlatform: 'ytsearch',
      onEmptyQueue: { destroyAfterMs: IDLE_DISCONNECT_MS },
    },
  });

  manager.nodeManager
    .on('connect', (node) => logger.success(`Lavalink node connected: ${node.id}`))
    .on('disconnect', (node, reason) => logger.warning(`Lavalink node ${node.id} disconnected: ${reason?.reason ?? ''}`))
    .on('error', (node, error) => logger.error(`Lavalink node ${node.id} error: ${error?.message ?? error}`));

  const textChannel = (player: { textChannelId?: string | null }): TextChannel | undefined => {
    const ch = player.textChannelId ? client.channels.cache.get(player.textChannelId) : undefined;
    return ch?.isTextBased?.() ? (ch as TextChannel) : undefined;
  };

  manager
    .on('trackStart', (player, track) => {
      if (!track) return;
      textChannel(player)
        ?.send(
          buildNowPlaying(track as unknown as TrackLike, {
            volume: player.volume,
            repeatMode: player.repeatMode,
            paused: player.paused,
          }) as never,
        )
        .catch(() => undefined);
    })
    .on('trackError', (_player, _track, payload) =>
      logger.error(`Music trackError: ${(payload as { exception?: { message?: string } })?.exception?.message ?? 'unknown'}`),
    )
    .on('queueEnd', (player) => {
      textChannel(player)
        ?.send('⏹️ خلصت القائمة — بأطلع من الروم بعد ٥ دقائق لو ما نزل شي جديد.')
        .catch(() => undefined);
    });

  logger.info('Music: Lavalink manager created (connecting on ready).');
  return manager;
}
