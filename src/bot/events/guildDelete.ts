import type { Guild } from 'discord.js';
import { logger } from '../../shared/logger';
import { markGuildLeft } from '../../db/subscriptions';

module.exports = {
  name: 'guildDelete',
  once: false,
  async execute(guild: Guild) {
    logger.info(`Left guild: ${guild.name ?? '?'} (${guild.id})`);
    await markGuildLeft(guild.id).catch((err) =>
      logger.error(`guildDelete cleanup failed for ${guild.id}: ${err}`),
    );
  },
};
