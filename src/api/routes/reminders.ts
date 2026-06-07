import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../../shared/config';
import { tenantGuildId } from '../middleware/tenant';

export interface RemindersDeps {
  prisma: PrismaClient;
  config: Pick<AppConfig, 'guildId'>;
}

export function createRemindersRouter(deps: RemindersDeps): Router {
  const router = Router();
  const { prisma } = deps;

  router.get('/', async (req, res) => {
    const guildId = tenantGuildId(req);
    const items = await prisma.reminder.findMany({ where: { guildId }, orderBy: { remindAt: 'asc' }, take: 100 });
    res.json({ items });
  });

  router.delete('/:id', async (req, res) => {
    const guildId = tenantGuildId(req);
    const { count } = await prisma.reminder.deleteMany({ where: { id: req.params.id, guildId } });
    if (count === 0) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  });

  return router;
}
