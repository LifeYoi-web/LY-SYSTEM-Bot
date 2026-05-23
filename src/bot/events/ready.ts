import { Client } from 'discord.js';
import { logger } from '../../shared/logger';

module.exports = {
  name: 'ready',
  once: true,
  execute(client: Client) {
    logger.success(`Bot is online as: ${client.user?.tag}`);
    logger.info(`Connected to ${client.guilds.cache.size} server(s)`);
  },
};
