import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../../shared/config';
import { getBirthdayConfig, updateBirthdayConfig } from '../../db/community';
import { optStr } from '../util';

export interface BirthdaysDeps {
  prisma: PrismaClient;
  config: Pick<AppConfig, 'guildId'>;
}

export function createBirthdaysRouter(deps: BirthdaysDeps): Router {
  const router = Router();
  const { prisma, config } = deps;
  const guildId = config.guildId;

  router.get('/', async (_req, res) => {
    const [cfg, birthdays] = await Promise.all([
      getBirthdayConfig(guildId),
      prisma.birthday.findMany({ where: { guildId }, orderBy: [{ month: 'asc' }, { day: 'asc' }] }),
    ]);
    res.json({ config: cfg, birthdays });
  });

  router.put('/config', async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (b.enabled !== undefined) data.enabled = Boolean(b.enabled);
    if (b.channelId !== undefined) data.channelId = optStr(b.channelId);
    if (b.roleId !== undefined) data.roleId = optStr(b.roleId);
    res.json(await updateBirthdayConfig(guildId, data));
  });

  return router;
}
