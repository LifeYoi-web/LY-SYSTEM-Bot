import type { Client } from 'discord.js';
import { logger } from '../shared/logger';
import { ensureGuildSettings } from '../db/settingsCache';
import { ensureSubscription } from '../db/subscriptions';
import { allowStatsGuild } from './stats';

/**
 * Boot-time registry sync: every guild the shared bot is currently in gets a
 * settings row, a Subscription row (free by default), and a stats allowlist
 * entry — covering guilds joined while the bot was offline (missed guildCreate).
 * Per-guild failures are logged and skipped. Returns the reconciled count.
 */
export async function reconcileKnownGuilds(client: Client): Promise<number> {
  let n = 0;
  for (const guild of client.guilds.cache.values()) {
    try {
      await ensureGuildSettings(guild.id);
      await ensureSubscription(guild.id);
      allowStatsGuild(guild.id);
      n++;
    } catch (err) {
      logger.warning(`Guild reconcile failed for ${guild.id}: ${err}`);
    }
  }
  return n;
}
