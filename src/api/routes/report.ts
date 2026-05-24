import { Router } from 'express';
import type { AppConfig } from '../../shared/config';
import { getReportConfig, updateReportConfig } from '../../db/community';
import { optStr } from '../util';

export interface ReportDeps {
  config: Pick<AppConfig, 'guildId'>;
}

export function createReportRouter(deps: ReportDeps): Router {
  const router = Router();
  const guildId = deps.config.guildId;

  router.get('/', async (_req, res) => res.json(await getReportConfig(guildId)));

  router.put('/', async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (b.channelId !== undefined) data.channelId = optStr(b.channelId);
    res.json(await updateReportConfig(guildId, data));
  });

  return router;
}
