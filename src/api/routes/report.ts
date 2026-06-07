import { Router } from 'express';
import type { Client } from 'discord.js';
import type { AppConfig } from '../../shared/config';
import { getReportConfig, updateReportConfig } from '../../db/community';
import { optStr, channelInGuild } from '../util';
import { tenantGuildId } from '../middleware/tenant';

export interface ReportDeps {
  client: Client;
  config: Pick<AppConfig, 'guildId'>;
}

export function createReportRouter(deps: ReportDeps): Router {
  const router = Router();
  const { client } = deps;

  router.get('/', async (req, res) => {
    const guildId = tenantGuildId(req);
    res.json(await getReportConfig(guildId));
  });

  router.put('/', async (req, res) => {
    const guildId = tenantGuildId(req);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (b.channelId !== undefined) {
      const v = optStr(b.channelId);
      if (v && !channelInGuild(client, guildId, v)) return res.status(400).json({ error: 'invalid channel' });
      data.channelId = v;
    }
    res.json(await updateReportConfig(guildId, data));
  });

  return router;
}
