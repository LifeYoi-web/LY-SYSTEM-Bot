import type { Guild } from 'discord.js';
import { logger } from '../../shared/logger';
import { ensureGuildSettings } from '../../db/settingsCache';
import { ensureSubscription } from '../../db/subscriptions';
import { allowStatsGuild } from '../stats';
import { postOnboarding } from '../onboarding';

module.exports = {
  name: 'guildCreate',
  once: false,
  async execute(guild: Guild) {
    logger.info(`Joined guild: ${guild.name} (${guild.id}, ${guild.memberCount} members)`);
    try {
      await ensureGuildSettings(guild.id);
      await ensureSubscription(guild.id); // free tier by default; re-join keeps the old plan
      allowStatsGuild(guild.id);
      const dashboardUrl = process.env.DASHBOARD_URL || '';
      if (dashboardUrl) {
        const posted = await postOnboarding(guild, dashboardUrl);
        if (!posted) logger.info(`Onboarding not posted for ${guild.id} (no sendable channel)`);
      }
    } catch (err) {
      logger.error(`guildCreate setup failed for ${guild.id}: ${err}`);
    }
  },
};
