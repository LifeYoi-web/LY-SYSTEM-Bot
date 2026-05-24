import { Router } from 'express';
import type { Client } from 'discord.js';
import type { AppConfig } from '../../shared/config';

export interface OverviewDeps {
  client: Client;
  config: Pick<AppConfig, 'guildId'>;
}

export function createOverviewRouter(deps: OverviewDeps): Router {
  const router = Router();
  router.get('/', (_req, res) => {
    const guild = deps.client.guilds.cache.get(deps.config.guildId);
    if (!guild) {
      res.status(503).json({ error: 'guild not available' });
      return;
    }
    res.json({
      name: guild.name,
      memberCount: guild.memberCount,
      channelCount: guild.channels.cache.size,
      recentLogs: [],
    });
  });
  return router;
}
