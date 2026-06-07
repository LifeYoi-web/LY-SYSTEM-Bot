import { Router } from 'express';
import type { Client, TextChannel } from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../../shared/config';
import { parseDuration } from '../../shared/duration';
import { buildGiveawayMessage, endGiveaway, rerollGiveaway } from '../../bot/giveaways';
import { planLimit } from '../middleware/entitlements';
import { tenantGuildId } from '../middleware/tenant';

export interface GiveawaysDeps {
  client: Client;
  prisma: PrismaClient;
  config: Pick<AppConfig, 'guildId'>;
}

export function createGiveawaysRouter(deps: GiveawaysDeps): Router {
  const router = Router();
  const { client, prisma } = deps;

  router.get('/', async (req, res) => {
    const guildId = tenantGuildId(req);
    const giveaways = await prisma.giveaway.findMany({ where: { guildId }, orderBy: { createdAt: 'desc' }, take: 50 });
    res.json({ giveaways });
  });

  router.post('/', async (req, res) => {
    const guildId = tenantGuildId(req);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const channelId = String(b.channelId ?? '');
    const prize = String(b.prize ?? '').trim().slice(0, 256);
    const winnerCount = Number(b.winnerCount ?? 1);
    const ms = parseDuration(String(b.duration ?? ''));
    if (!channelId) return res.status(400).json({ error: 'channelId required' });
    if (!prize) return res.status(400).json({ error: 'prize required' });
    if (!Number.isInteger(winnerCount) || winnerCount < 1 || winnerCount > 50) {
      return res.status(400).json({ error: 'winnerCount must be 1..50' });
    }
    if (ms == null) return res.status(400).json({ error: 'duration must look like 10m / 2h / 1d' });

    const limit = await planLimit(guildId, 'activeGiveaways');
    if ((await prisma.giveaway.count({ where: { guildId, ended: false } })) >= limit) {
      return res.status(403).json({ error: 'limit reached', upgrade: true, limit });
    }

    const channel = client.channels.cache.get(channelId) as TextChannel | undefined;
    if (!channel?.isTextBased?.()) return res.status(400).json({ error: 'invalid channel' });

    let giveaway = await prisma.giveaway.create({
      data: { guildId, channelId, prize, winnerCount, endsAt: new Date(Date.now() + ms) },
    });
    try {
      const msg = await channel.send(buildGiveawayMessage(giveaway));
      giveaway = await prisma.giveaway.update({ where: { id: giveaway.id }, data: { messageId: msg.id } });
      res.status(201).json(giveaway);
    } catch {
      await prisma.giveaway.delete({ where: { id: giveaway.id } }).catch(() => undefined);
      res.status(502).json({ error: 'could not post giveaway — check bot permissions' });
    }
  });

  router.post('/:id/end', async (req, res) => {
    const guildId = tenantGuildId(req);
    const g = await prisma.giveaway.findUnique({ where: { id: req.params.id } });
    if (!g || g.guildId !== guildId) return res.status(404).json({ error: 'giveaway not found' });
    if (g.ended) return res.status(400).json({ error: 'already ended' });
    const winners = await endGiveaway(client, prisma, g);
    res.json({ ok: true, winners });
  });

  router.post('/:id/reroll', async (req, res) => {
    const guildId = tenantGuildId(req);
    const g = await prisma.giveaway.findUnique({ where: { id: req.params.id } });
    if (!g || g.guildId !== guildId) return res.status(404).json({ error: 'giveaway not found' });
    if (!g.ended) return res.status(400).json({ error: 'giveaway has not ended yet' });
    const winners = await rerollGiveaway(client, prisma, g);
    res.json({ ok: true, winners });
  });

  router.delete('/:id', async (req, res) => {
    await prisma.giveaway.delete({ where: { id: req.params.id } }).catch(() => undefined);
    res.json({ ok: true });
  });

  return router;
}
