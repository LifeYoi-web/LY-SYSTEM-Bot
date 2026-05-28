import { Router } from 'express';
import type { Client } from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../../shared/config';
import { getTempVoiceConfig, updateTempVoiceConfig } from '../../db/community';
import { optStr } from '../util';

export interface TempVoiceDeps {
  client: Client;
  prisma: PrismaClient;
  config: Pick<AppConfig, 'guildId'>;
}

const MAX_TEMPLATE = 80;

export function createTempVoiceRouter(deps: TempVoiceDeps): Router {
  const router = Router();
  const { config } = deps;
  const guildId = config.guildId;

  router.get('/', async (_req, res) => {
    res.json({ config: await getTempVoiceConfig(guildId) });
  });

  router.put('/config', async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (b.enabled !== undefined) data.enabled = Boolean(b.enabled);
    if (b.hubChannelId !== undefined) data.hubChannelId = optStr(b.hubChannelId);
    if (b.categoryId !== undefined) data.categoryId = optStr(b.categoryId);
    if (b.nameTemplate !== undefined) {
      const s = optStr(b.nameTemplate);
      if (!s) return res.status(400).json({ error: 'nameTemplate required' });
      if (s.length > MAX_TEMPLATE) return res.status(400).json({ error: 'nameTemplate too long' });
      data.nameTemplate = s;
    }
    if (b.defaultUserLimit !== undefined) {
      const n = Number(b.defaultUserLimit);
      if (!Number.isFinite(n) || n < 0 || n > 99) return res.status(400).json({ error: 'defaultUserLimit must be 0..99' });
      data.defaultUserLimit = Math.floor(n);
    }
    if (b.defaultLocked !== undefined) data.defaultLocked = Boolean(b.defaultLocked);
    res.json(await updateTempVoiceConfig(guildId, data));
  });

  return router;
}
