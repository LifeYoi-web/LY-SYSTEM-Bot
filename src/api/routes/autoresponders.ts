import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../../shared/config';
import { invalidateAutoResponses } from '../../db/autoresponses';

export interface AutoRespondersDeps {
  prisma: PrismaClient;
  config: Pick<AppConfig, 'guildId'>;
}

const MATCH_TYPES = ['contains', 'exact', 'startswith'];

export function createAutoRespondersRouter(deps: AutoRespondersDeps): Router {
  const router = Router();
  const { prisma, config } = deps;
  const guildId = config.guildId;

  router.get('/', async (_req, res) => {
    const items = await prisma.autoResponse.findMany({ where: { guildId }, orderBy: { id: 'desc' } });
    res.json({ items });
  });

  router.post('/', async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const trigger = String(b.trigger ?? '').trim().slice(0, 100);
    const reply = String(b.reply ?? '').trim().slice(0, 1000);
    const matchType = String(b.matchType ?? 'contains');
    if (!trigger || !reply) return res.status(400).json({ error: 'trigger and reply required' });
    if (!MATCH_TYPES.includes(matchType)) return res.status(400).json({ error: 'invalid matchType' });
    const item = await prisma.autoResponse.create({
      data: { guildId, trigger, reply, matchType, enabled: b.enabled === undefined ? true : Boolean(b.enabled) },
    });
    invalidateAutoResponses(guildId);
    res.status(201).json(item);
  });

  router.put('/:id', async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (b.trigger !== undefined) data.trigger = String(b.trigger).trim().slice(0, 100);
    if (b.reply !== undefined) data.reply = String(b.reply).trim().slice(0, 1000);
    if (b.matchType !== undefined) {
      if (!MATCH_TYPES.includes(String(b.matchType))) return res.status(400).json({ error: 'invalid matchType' });
      data.matchType = String(b.matchType);
    }
    if (b.enabled !== undefined) data.enabled = Boolean(b.enabled);
    const item = await prisma.autoResponse.update({ where: { id: req.params.id }, data });
    invalidateAutoResponses(guildId);
    res.json(item);
  });

  router.delete('/:id', async (req, res) => {
    await prisma.autoResponse.delete({ where: { id: req.params.id } }).catch(() => undefined);
    invalidateAutoResponses(guildId);
    res.json({ ok: true });
  });

  return router;
}
