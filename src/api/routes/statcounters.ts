import { Router } from 'express';
import type { Client } from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../../shared/config';
import { planLimit } from '../middleware/entitlements';
import { tenantGuildId } from '../middleware/tenant';
import { channelInGuild } from '../util';

export interface StatCountersDeps {
  client: Client;
  prisma: PrismaClient;
  config: Pick<AppConfig, 'guildId'>;
}

const TYPES = ['members', 'humans', 'bots', 'roles', 'channels', 'boosts'];

export function createStatCountersRouter(deps: StatCountersDeps): Router {
  const router = Router();
  const { client, prisma } = deps;

  router.get('/', async (req, res) => {
    const guildId = tenantGuildId(req);
    const counters = await prisma.statCounter.findMany({ where: { guildId } });
    res.json({ counters });
  });

  router.post('/', async (req, res) => {
    const guildId = tenantGuildId(req);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const channelId = String(b.channelId ?? '');
    const type = String(b.type ?? '');
    const template = String(b.template ?? '{name}: {count}').slice(0, 100);
    if (!channelId) return res.status(400).json({ error: 'channelId required' });
    if (!TYPES.includes(type)) return res.status(400).json({ error: `type must be one of ${TYPES.join(', ')}` });
    if (!channelInGuild(client, guildId, channelId)) return res.status(400).json({ error: 'invalid channel' });
    const limit = await planLimit(guildId, 'statCounters');
    if ((await prisma.statCounter.count({ where: { guildId } })) >= limit) {
      return res.status(403).json({ error: 'limit reached', upgrade: true, limit });
    }
    const counter = await prisma.statCounter.create({ data: { guildId, channelId, type, template } });
    res.status(201).json(counter);
  });

  router.delete('/:id', async (req, res) => {
    const guildId = tenantGuildId(req);
    const { count } = await prisma.statCounter.deleteMany({ where: { id: req.params.id, guildId } });
    if (count === 0) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  });

  return router;
}
