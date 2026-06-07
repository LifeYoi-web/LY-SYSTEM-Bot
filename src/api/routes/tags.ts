import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../../shared/config';
import { planLimit } from '../middleware/entitlements';
import { tenantGuildId } from '../middleware/tenant';

export interface TagsDeps {
  prisma: PrismaClient;
  config: Pick<AppConfig, 'guildId'>;
}

export function createTagsRouter(deps: TagsDeps): Router {
  const router = Router();
  const { prisma } = deps;

  router.get('/', async (req, res) => {
    const guildId = tenantGuildId(req);
    const tags = await prisma.tag.findMany({ where: { guildId }, orderBy: { name: 'asc' } });
    res.json({ tags });
  });

  router.post('/', async (req, res) => {
    const guildId = tenantGuildId(req);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const name = String(b.name ?? '').trim().toLowerCase().slice(0, 32);
    const content = String(b.content ?? '').trim().slice(0, 2000);
    if (!name || !content) return res.status(400).json({ error: 'name and content required' });
    const exists = await prisma.tag.findUnique({ where: { guildId_name: { guildId, name } } });
    if (exists) return res.status(409).json({ error: 'a tag with that name already exists' });
    const limit = await planLimit(guildId, 'tags');
    if ((await prisma.tag.count({ where: { guildId } })) >= limit) {
      return res.status(403).json({ error: 'limit reached', upgrade: true, limit });
    }
    const tag = await prisma.tag.create({ data: { guildId, name, content } });
    res.status(201).json(tag);
  });

  router.put('/:id', async (req, res) => {
    const guildId = tenantGuildId(req);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (b.content !== undefined) data.content = String(b.content).trim().slice(0, 2000);
    const found = await prisma.tag.findUnique({ where: { id: req.params.id } });
    if (!found || found.guildId !== guildId) return res.status(404).json({ error: 'tag not found' });
    const tag = await prisma.tag.update({ where: { id: req.params.id }, data });
    res.json(tag);
  });

  router.delete('/:id', async (req, res) => {
    await prisma.tag.delete({ where: { id: req.params.id } }).catch(() => undefined);
    res.json({ ok: true });
  });

  return router;
}
