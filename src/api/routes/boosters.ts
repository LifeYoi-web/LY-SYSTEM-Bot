import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../../shared/config';
import { getBoosterConfig, updateBoosterConfig } from '../../db/community';
import { tenantGuildId } from '../middleware/tenant';

export interface BoostersDeps {
  prisma: PrismaClient;
  config: Pick<AppConfig, 'guildId'>;
}

const optStr = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return s ? s : null;
};

export function createBoostersRouter(deps: BoostersDeps): Router {
  const router = Router();
  const { prisma } = deps;

  router.get('/', async (req, res) => {
    const guildId = tenantGuildId(req);
    const [cfg, boosters] = await Promise.all([
      getBoosterConfig(guildId),
      prisma.boosterRecord.findMany({ where: { guildId, active: true }, orderBy: { startedAt: 'asc' } }),
    ]);
    res.json({ config: cfg, boosters });
  });

  router.put('/config', async (req, res) => {
    const guildId = tenantGuildId(req);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (b.enabled !== undefined) data.enabled = Boolean(b.enabled);
    if (b.announceChannelId !== undefined) data.announceChannelId = optStr(b.announceChannelId);
    if (b.message !== undefined) {
      const s = optStr(b.message);
      if (s && s.length > 1000) return res.status(400).json({ error: 'message too long' });
      data.message = s;
    }
    if (b.coinBonus !== undefined) {
      const n = Number(b.coinBonus);
      if (!Number.isInteger(n) || n < 0 || n > 1_000_000) return res.status(400).json({ error: 'coinBonus invalid' });
      data.coinBonus = n;
    }
    if (b.perkRoleIds !== undefined) {
      if (!Array.isArray(b.perkRoleIds)) return res.status(400).json({ error: 'perkRoleIds must be an array' });
      data.perkRoleIds = (b.perkRoleIds as unknown[]).map(String).slice(0, 25);
    }
    res.json(await updateBoosterConfig(guildId, data));
  });

  return router;
}
