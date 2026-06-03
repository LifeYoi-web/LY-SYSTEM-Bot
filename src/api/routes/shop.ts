import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../../shared/config';

export interface ShopDeps {
  prisma: PrismaClient;
  config: Pick<AppConfig, 'guildId'>;
}

function intOrNull(v: unknown, min: number, max: number): number | null | undefined {
  if (v === null || v === '') return null;
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) return undefined; // caller treats undefined as "skip/invalid"
  return n;
}

export function createShopRouter(deps: ShopDeps): Router {
  const router = Router();
  const { prisma, config } = deps;
  const guildId = config.guildId;

  router.get('/', async (_req, res) => {
    const items = await prisma.shopItem.findMany({ where: { guildId }, orderBy: { position: 'asc' } });
    res.json({ items });
  });

  router.post('/items', async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const roleId = String(b.roleId ?? '').trim();
    const price = Number(b.price);
    if (!roleId) return res.status(400).json({ error: 'roleId required' });
    if (!Number.isInteger(price) || price < 0 || price > 100_000_000) return res.status(400).json({ error: 'price invalid' });
    const label = b.label !== undefined ? String(b.label).slice(0, 80) || null : null;
    const stock = b.stock === undefined ? -1 : Number(b.stock);
    if (!Number.isInteger(stock) || stock < -1) return res.status(400).json({ error: 'stock invalid' });
    const durationHours = b.durationHours === undefined || b.durationHours === null || b.durationHours === '' ? null : Number(b.durationHours);
    if (durationHours !== null && (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > 8760)) {
      return res.status(400).json({ error: 'durationHours must be 1..8760 or empty' });
    }
    const requiredLevel = b.requiredLevel === undefined || b.requiredLevel === null || b.requiredLevel === '' ? null : Number(b.requiredLevel);
    if (requiredLevel !== null && (!Number.isInteger(requiredLevel) || requiredLevel < 0 || requiredLevel > 1000)) {
      return res.status(400).json({ error: 'requiredLevel must be 0..1000 or empty' });
    }
    const position = Number(b.position ?? 0) || 0;
    const item = await prisma.shopItem.create({
      data: { guildId, roleId, price, label, stock, durationHours, requiredLevel, position },
    });
    res.status(201).json(item);
  });

  router.put('/items/:id', async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (b.roleId !== undefined) data.roleId = String(b.roleId);
    if (b.label !== undefined) data.label = String(b.label).slice(0, 80) || null;
    if (b.enabled !== undefined) data.enabled = Boolean(b.enabled);
    if (b.price !== undefined) {
      const n = Number(b.price);
      if (!Number.isInteger(n) || n < 0) return res.status(400).json({ error: 'price invalid' });
      data.price = n;
    }
    if (b.stock !== undefined) {
      const n = Number(b.stock);
      if (!Number.isInteger(n) || n < -1) return res.status(400).json({ error: 'stock invalid' });
      data.stock = n;
    }
    if (b.position !== undefined) data.position = Number(b.position) || 0;
    if (b.durationHours !== undefined) {
      const n = intOrNull(b.durationHours, 1, 8760);
      if (n === undefined) return res.status(400).json({ error: 'durationHours must be 1..8760 or empty' });
      data.durationHours = n;
    }
    if (b.requiredLevel !== undefined) {
      const n = intOrNull(b.requiredLevel, 0, 1000);
      if (n === undefined) return res.status(400).json({ error: 'requiredLevel must be 0..1000 or empty' });
      data.requiredLevel = n;
    }
    const updated = await prisma.shopItem.update({ where: { id: req.params.id }, data }).catch(() => null);
    if (!updated) return res.status(404).json({ error: 'not found' });
    res.json(updated);
  });

  router.delete('/items/:id', async (req, res) => {
    await prisma.shopItem.delete({ where: { id: req.params.id } }).catch(() => undefined);
    res.json({ ok: true });
  });

  return router;
}
