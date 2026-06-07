import { Router } from 'express';
import type { Client, TextChannel } from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../../shared/config';
import { getSuggestionConfig, updateSuggestionConfig } from '../../db/community';
import { buildSuggestionMessage } from '../../bot/suggestions';
import { optStr } from '../util';
import { tenantGuildId } from '../middleware/tenant';

export interface SuggestionsDeps {
  client: Client;
  prisma: PrismaClient;
  config: Pick<AppConfig, 'guildId'>;
}

export function createSuggestionsRouter(deps: SuggestionsDeps): Router {
  const router = Router();
  const { client, prisma } = deps;

  router.get('/', async (req, res) => {
    const guildId = tenantGuildId(req);
    const [cfg, suggestions] = await Promise.all([
      getSuggestionConfig(guildId),
      prisma.suggestion.findMany({ where: { guildId }, orderBy: { createdAt: 'desc' }, take: 100 }),
    ]);
    res.json({ config: cfg, suggestions });
  });

  router.put('/config', async (req, res) => {
    const guildId = tenantGuildId(req);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (b.enabled !== undefined) data.enabled = Boolean(b.enabled);
    if (b.channelId !== undefined) data.channelId = optStr(b.channelId);
    res.json(await updateSuggestionConfig(guildId, data));
  });

  async function setStatus(id: string, status: 'approved' | 'denied', guildId: string, res: import('express').Response) {
    const found = await prisma.suggestion.findUnique({ where: { id } });
    if (!found || found.guildId !== guildId) return res.status(404).json({ error: 'suggestion not found' });
    const updated = await prisma.suggestion.update({ where: { id }, data: { status } });
    if (updated.messageId) {
      const channel = client.channels.cache.get(updated.channelId) as TextChannel | undefined;
      const msg = await channel?.messages?.fetch(updated.messageId).catch(() => null);
      await msg?.edit(buildSuggestionMessage(updated)).catch(() => undefined);
    }
    res.json(updated);
  }

  router.post('/:id/approve', (req, res) => setStatus(req.params.id, 'approved', tenantGuildId(req), res));
  router.post('/:id/deny', (req, res) => setStatus(req.params.id, 'denied', tenantGuildId(req), res));

  return router;
}
