import { Router } from 'express';
import type { Client } from 'discord.js';
import type { AppConfig } from '../../shared/config';
import { getCounting, updateCounting } from '../../db/community';
import { optStr, channelInGuild } from '../util';
import { tenantGuildId } from '../middleware/tenant';

export interface CountingDeps {
  client: Client;
  config: Pick<AppConfig, 'guildId'>;
}

export function createCountingRouter(deps: CountingDeps): Router {
  const router = Router();
  const { client } = deps;

  router.get('/', async (req, res) => {
    const guildId = tenantGuildId(req);
    res.json(await getCounting(guildId));
  });

  router.put('/', async (req, res) => {
    const guildId = tenantGuildId(req);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (b.enabled !== undefined) data.enabled = Boolean(b.enabled);
    if (b.channelId !== undefined) {
      const v = optStr(b.channelId);
      if (v && !channelInGuild(client, guildId, v)) return res.status(400).json({ error: 'invalid channel' });
      data.channelId = v;
    }
    if (b.reset === true) {
      data.current = 0;
      data.lastUserId = null;
    }
    res.json(await updateCounting(guildId, data));
  });

  return router;
}
