import { Router } from 'express';
import type { Client } from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../../shared/config';
import { getBirthdayConfig, updateBirthdayConfig } from '../../db/community';
import { optStr, channelInGuild } from '../util';
import { tenantGuildId } from '../middleware/tenant';

export interface BirthdaysDeps {
  client: Client;
  prisma: PrismaClient;
  config: Pick<AppConfig, 'guildId'>;
}

export function createBirthdaysRouter(deps: BirthdaysDeps): Router {
  const router = Router();
  const { client, prisma } = deps;

  router.get('/', async (req, res) => {
    const guildId = tenantGuildId(req);
    const [cfg, birthdays] = await Promise.all([
      getBirthdayConfig(guildId),
      prisma.birthday.findMany({ where: { guildId }, orderBy: [{ month: 'asc' }, { day: 'asc' }] }),
    ]);
    res.json({ config: cfg, birthdays });
  });

  router.put('/config', async (req, res) => {
    const guildId = tenantGuildId(req);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (b.enabled !== undefined) data.enabled = Boolean(b.enabled);
    if (b.channelId !== undefined) {
      const v = optStr(b.channelId);
      if (v && !channelInGuild(client, guildId, v)) return res.status(400).json({ error: 'invalid channel' });
      data.channelId = v;
    }
    if (b.roleId !== undefined) data.roleId = optStr(b.roleId);
    res.json(await updateBirthdayConfig(guildId, data));
  });

  return router;
}
