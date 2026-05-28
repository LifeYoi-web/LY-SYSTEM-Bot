import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../../shared/config';
import { optStr } from '../util';

export interface NotesDeps {
  prisma: PrismaClient;
  config: Pick<AppConfig, 'guildId'>;
}

const MAX_CONTENT = 1000;

export function createNotesRouter(deps: NotesDeps): Router {
  const router = Router();
  const { prisma, config } = deps;
  const guildId = config.guildId;

  router.get('/', async (req, res) => {
    const userId = req.query.userId ? String(req.query.userId) : undefined;
    const notes = await prisma.memberNote.findMany({
      where: { guildId, ...(userId ? { userId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json({ notes });
  });

  router.post('/', async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const userId = optStr(b.userId);
    const content = optStr(b.content);
    if (!userId) return res.status(400).json({ error: 'userId required' });
    if (!content) return res.status(400).json({ error: 'content required' });
    if (content.length > MAX_CONTENT) return res.status(400).json({ error: 'content too long' });
    const authorId = req.session?.user?.id ?? 'dashboard';
    const created = await prisma.memberNote.create({ data: { guildId, userId, authorId, content } });
    res.status(201).json(created);
  });

  router.delete('/:id', async (req, res) => {
    const r = await prisma.memberNote.deleteMany({ where: { guildId, id: req.params.id } });
    if (r.count === 0) return res.status(404).json({ error: 'note not found' });
    res.json({ ok: true });
  });

  return router;
}
