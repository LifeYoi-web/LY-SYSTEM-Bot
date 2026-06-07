import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../../shared/config';
import { getInviteConfig, updateInviteConfig } from '../../db/community';
import { tenantGuildId } from '../middleware/tenant';

export interface InvitesDeps {
  prisma: PrismaClient;
  config: Pick<AppConfig, 'guildId'>;
}

const optStr = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return s ? s : null;
};

export function createInvitesRouter(deps: InvitesDeps): Router {
  const router = Router();
  const { prisma } = deps;

  router.get('/', async (req, res) => {
    const guildId = tenantGuildId(req);
    const [cfg, leaderboard] = await Promise.all([
      getInviteConfig(guildId),
      prisma.inviteStat.findMany({ where: { guildId }, orderBy: { regular: 'desc' }, take: 50 }),
    ]);
    res.json({ config: cfg, leaderboard });
  });

  router.put('/config', async (req, res) => {
    const guildId = tenantGuildId(req);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (b.enabled !== undefined) data.enabled = Boolean(b.enabled);
    if (b.fakeDays !== undefined) {
      const n = Number(b.fakeDays);
      if (!Number.isInteger(n) || n < 0 || n > 365) return res.status(400).json({ error: 'fakeDays must be 0..365' });
      data.fakeDays = n;
    }
    if (b.rewardThreshold !== undefined) {
      const n = Number(b.rewardThreshold);
      if (!Number.isInteger(n) || n < 0 || n > 100000) return res.status(400).json({ error: 'rewardThreshold invalid' });
      data.rewardThreshold = n;
    }
    if (b.rewardRoleId !== undefined) data.rewardRoleId = optStr(b.rewardRoleId);
    if (b.logChannelId !== undefined) data.logChannelId = optStr(b.logChannelId);
    res.json(await updateInviteConfig(guildId, data));
  });

  return router;
}
