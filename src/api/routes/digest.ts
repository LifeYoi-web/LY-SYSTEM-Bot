import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { Client } from 'discord.js';
import type { AppConfig } from '../../shared/config';
import { getDigestConfig, updateDigestConfig } from '../../db/community';
import { postWeeklyDigest } from '../../bot/scheduler-tasks';
import { tenantGuildId } from '../middleware/tenant';
import { channelInGuild } from '../util';

export interface DigestDeps {
  client: Client;
  prisma: PrismaClient;
  config: Pick<AppConfig, 'guildId'>;
}

const optStr = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return s ? s : null;
};

export function createDigestRouter(deps: DigestDeps): Router {
  const router = Router();
  const { client } = deps;

  router.get('/', async (req, res) => {
    const guildId = tenantGuildId(req);
    res.json(await getDigestConfig(guildId));
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
    if (b.weekday !== undefined) {
      const n = Number(b.weekday);
      if (!Number.isInteger(n) || n < 0 || n > 6) return res.status(400).json({ error: 'weekday must be 0..6' });
      data.weekday = n;
    }
    res.json(await updateDigestConfig(guildId, data));
  });

  // Post a digest now (ignores the weekday/once-per-day guards).
  router.post('/test', async (req, res) => {
    const guildId = tenantGuildId(req);
    const ok = await postWeeklyDigest({ client: deps.client, prisma: deps.prisma, guildId }, new Date(), true);
    res.json({ ok });
  });

  return router;
}
