import { Router } from 'express';
import type { Client } from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../../shared/config';
import { repostSticky } from '../../bot/sticky';
import { invalidateSticky } from '../../db/community';
import { tenantGuildId } from '../middleware/tenant';
import { channelInGuild } from '../util';

export interface StickyDeps {
  client: Client;
  prisma: PrismaClient;
  config: Pick<AppConfig, 'guildId'>;
}

export function createStickyRouter(deps: StickyDeps): Router {
  const router = Router();
  const { client, prisma } = deps;

  router.get('/', async (req, res) => {
    const guildId = tenantGuildId(req);
    const items = await prisma.stickyMessage.findMany({ where: { guildId } });
    res.json({ items });
  });

  router.put('/', async (req, res) => {
    const guildId = tenantGuildId(req);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const channelId = String(b.channelId ?? '');
    const content = String(b.content ?? '').trim().slice(0, 2000);
    if (!channelId) return res.status(400).json({ error: 'channelId required' });
    if (!content) return res.status(400).json({ error: 'content required' });
    if (!channelInGuild(client, guildId, channelId)) return res.status(400).json({ error: 'invalid channel' });
    const enabled = b.enabled === undefined ? true : Boolean(b.enabled);
    const item = await prisma.stickyMessage.upsert({
      where: { guildId_channelId: { guildId, channelId } },
      create: { guildId, channelId, content, enabled },
      update: { content, enabled },
    });
    invalidateSticky(guildId);
    if (enabled) await repostSticky(client, prisma, guildId, channelId).catch(() => undefined);
    res.json(item);
  });

  router.delete('/:channelId', async (req, res) => {
    const guildId = tenantGuildId(req);
    const channelId = req.params.channelId;
    const existing = await prisma.stickyMessage.findUnique({ where: { guildId_channelId: { guildId, channelId } } });
    if (existing?.lastMessageId) {
      const channel = client.channels.cache.get(channelId);
      const msg = await (channel as any)?.messages?.fetch(existing.lastMessageId).catch(() => null);
      await msg?.delete().catch(() => undefined);
    }
    await prisma.stickyMessage.delete({ where: { guildId_channelId: { guildId, channelId } } }).catch(() => undefined);
    invalidateSticky(guildId);
    res.json({ ok: true });
  });

  return router;
}
