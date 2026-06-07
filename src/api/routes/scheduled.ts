import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../../shared/config';
import { planLimit } from '../middleware/entitlements';

export interface ScheduledDeps {
  prisma: PrismaClient;
  config: Pick<AppConfig, 'guildId'>;
}

const REPEATS = ['none', 'daily', 'weekly'];

export function createScheduledRouter(deps: ScheduledDeps): Router {
  const router = Router();
  const { prisma, config } = deps;
  const guildId = config.guildId;

  router.get('/', async (_req, res) => {
    const items = await prisma.scheduledMessage.findMany({ where: { guildId }, orderBy: { runAt: 'asc' } });
    res.json({ items });
  });

  router.post('/', async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const channelId = String(b.channelId ?? '');
    const content = String(b.content ?? '').trim().slice(0, 2000);
    const repeat = String(b.repeat ?? 'none');
    const runAt = new Date(String(b.runAt ?? ''));
    if (!channelId) return res.status(400).json({ error: 'channelId required' });
    if (!content) return res.status(400).json({ error: 'content required' });
    if (Number.isNaN(runAt.getTime())) return res.status(400).json({ error: 'invalid runAt' });
    if (!REPEATS.includes(repeat)) return res.status(400).json({ error: 'invalid repeat' });
    const limit = await planLimit(guildId, 'scheduledMessages');
    if ((await prisma.scheduledMessage.count({ where: { guildId } })) >= limit) {
      return res.status(403).json({ error: 'limit reached', upgrade: true, limit });
    }
    const item = await prisma.scheduledMessage.create({ data: { guildId, channelId, content, runAt, repeat } });
    res.status(201).json(item);
  });

  router.put('/:id', async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (b.channelId !== undefined) data.channelId = String(b.channelId);
    if (b.content !== undefined) data.content = String(b.content).trim().slice(0, 2000);
    if (b.enabled !== undefined) data.enabled = Boolean(b.enabled);
    if (b.repeat !== undefined) {
      if (!REPEATS.includes(String(b.repeat))) return res.status(400).json({ error: 'invalid repeat' });
      data.repeat = String(b.repeat);
    }
    if (b.runAt !== undefined) {
      const d = new Date(String(b.runAt));
      if (Number.isNaN(d.getTime())) return res.status(400).json({ error: 'invalid runAt' });
      data.runAt = d;
    }
    const item = await prisma.scheduledMessage.update({ where: { id: req.params.id }, data });
    res.json(item);
  });

  router.delete('/:id', async (req, res) => {
    await prisma.scheduledMessage.delete({ where: { id: req.params.id } }).catch(() => undefined);
    res.json({ ok: true });
  });

  return router;
}
