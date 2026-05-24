import { Router } from 'express';
import type { Client, TextChannel } from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../../shared/config';
import { getTicketConfig, updateTicketConfig } from '../../db/community';
import { buildTicketPanel } from '../../bot/tickets';
import { optStr } from '../util';

export interface TicketsDeps {
  client: Client;
  prisma: PrismaClient;
  config: Pick<AppConfig, 'guildId'>;
}

export function createTicketsRouter(deps: TicketsDeps): Router {
  const router = Router();
  const { client, prisma, config } = deps;
  const guildId = config.guildId;

  router.get('/', async (_req, res) => {
    const [cfg, tickets] = await Promise.all([
      getTicketConfig(guildId),
      prisma.ticket.findMany({ where: { guildId, status: 'open' }, orderBy: { createdAt: 'desc' } }),
    ]);
    res.json({ config: cfg, tickets });
  });

  router.put('/config', async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (b.enabled !== undefined) data.enabled = Boolean(b.enabled);
    if (b.categoryId !== undefined) data.categoryId = optStr(b.categoryId);
    if (b.supportRoleId !== undefined) data.supportRoleId = optStr(b.supportRoleId);
    if (b.openMessage !== undefined) {
      const s = optStr(b.openMessage);
      if (s && s.length > 1000) return res.status(400).json({ error: 'openMessage too long' });
      data.openMessage = s;
    }
    res.json(await updateTicketConfig(guildId, data));
  });

  router.post('/panel', async (req, res) => {
    const channelId = String((req.body ?? {}).channelId ?? '');
    if (!channelId) return res.status(400).json({ error: 'channelId required' });
    const cfg = await getTicketConfig(guildId);
    const channel = client.channels.cache.get(channelId) as TextChannel | undefined;
    if (!channel?.isTextBased?.()) return res.status(400).json({ error: 'invalid channel' });
    try {
      await channel.send(buildTicketPanel(cfg.openMessage));
      res.json({ ok: true });
    } catch {
      res.status(502).json({ error: 'could not post panel — check bot permissions' });
    }
  });

  return router;
}
