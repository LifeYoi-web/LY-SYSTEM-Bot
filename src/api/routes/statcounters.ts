import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../../shared/config';
import { planLimit } from '../middleware/entitlements';

export interface StatCountersDeps {
  prisma: PrismaClient;
  config: Pick<AppConfig, 'guildId'>;
}

const TYPES = ['members', 'humans', 'bots', 'roles', 'channels', 'boosts'];

export function createStatCountersRouter(deps: StatCountersDeps): Router {
  const router = Router();
  const { prisma, config } = deps;
  const guildId = config.guildId;

  router.get('/', async (_req, res) => {
    const counters = await prisma.statCounter.findMany({ where: { guildId } });
    res.json({ counters });
  });

  router.post('/', async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const channelId = String(b.channelId ?? '');
    const type = String(b.type ?? '');
    const template = String(b.template ?? '{name}: {count}').slice(0, 100);
    if (!channelId) return res.status(400).json({ error: 'channelId required' });
    if (!TYPES.includes(type)) return res.status(400).json({ error: `type must be one of ${TYPES.join(', ')}` });
    const limit = await planLimit(guildId, 'statCounters');
    if ((await prisma.statCounter.count({ where: { guildId } })) >= limit) {
      return res.status(403).json({ error: 'limit reached', upgrade: true, limit });
    }
    const counter = await prisma.statCounter.create({ data: { guildId, channelId, type, template } });
    res.status(201).json(counter);
  });

  router.delete('/:id', async (req, res) => {
    await prisma.statCounter.delete({ where: { id: req.params.id } }).catch(() => undefined);
    res.json({ ok: true });
  });

  return router;
}
