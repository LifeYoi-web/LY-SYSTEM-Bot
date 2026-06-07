import { Router } from 'express';
import type { Client } from 'discord.js';
import type { AppConfig } from '../../shared/config';
import { getStarboard, updateStarboard } from '../../db/community';
import { optStr, channelInGuild } from '../util';
import { tenantGuildId } from '../middleware/tenant';

export interface StarboardDeps {
  client: Client;
  config: Pick<AppConfig, 'guildId'>;
}

export function createStarboardRouter(deps: StarboardDeps): Router {
  const router = Router();
  const { client } = deps;

  router.get('/', async (req, res) => {
    const guildId = tenantGuildId(req);
    res.json(await getStarboard(guildId));
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
    if (b.emoji !== undefined) data.emoji = String(b.emoji).slice(0, 32) || '⭐';
    if (b.threshold !== undefined) {
      const n = Number(b.threshold);
      if (!Number.isInteger(n) || n < 1 || n > 50) return res.status(400).json({ error: 'threshold must be 1..50' });
      data.threshold = n;
    }
    res.json(await updateStarboard(guildId, data));
  });

  return router;
}
