import { Router } from 'express';
import type { AppConfig } from '../../shared/config';
import { getStarboard, updateStarboard } from '../../db/community';
import { optStr } from '../util';

export interface StarboardDeps {
  config: Pick<AppConfig, 'guildId'>;
}

export function createStarboardRouter(deps: StarboardDeps): Router {
  const router = Router();
  const guildId = deps.config.guildId;

  router.get('/', async (_req, res) => res.json(await getStarboard(guildId)));

  router.put('/', async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (b.enabled !== undefined) data.enabled = Boolean(b.enabled);
    if (b.channelId !== undefined) data.channelId = optStr(b.channelId);
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
