import { Router } from 'express';
import type { AppConfig } from '../../shared/config';
import { getCounting, updateCounting } from '../../db/community';
import { optStr } from '../util';

export interface CountingDeps {
  config: Pick<AppConfig, 'guildId'>;
}

export function createCountingRouter(deps: CountingDeps): Router {
  const router = Router();
  const guildId = deps.config.guildId;

  router.get('/', async (_req, res) => res.json(await getCounting(guildId)));

  router.put('/', async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (b.enabled !== undefined) data.enabled = Boolean(b.enabled);
    if (b.channelId !== undefined) data.channelId = optStr(b.channelId);
    if (b.reset === true) {
      data.current = 0;
      data.lastUserId = null;
    }
    res.json(await updateCounting(guildId, data));
  });

  return router;
}
