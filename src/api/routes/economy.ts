import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../../shared/config';
import { getEconomyConfig, updateEconomyConfig } from '../../db/community';
import { addCoins } from '../../bot/economy';

export interface EconomyDeps {
  prisma: PrismaClient;
  config: Pick<AppConfig, 'guildId'>;
}

export function createEconomyRouter(deps: EconomyDeps): Router {
  const router = Router();
  const { prisma, config } = deps;
  const guildId = config.guildId;

  router.get('/', async (_req, res) => {
    const [cfg, leaderboard] = await Promise.all([
      getEconomyConfig(guildId),
      prisma.wallet.findMany({ where: { guildId }, orderBy: { balance: 'desc' }, take: 25 }),
    ]);
    res.json({ config: cfg, leaderboard });
  });

  router.put('/config', async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (b.enabled !== undefined) data.enabled = Boolean(b.enabled);
    if (b.currencyName !== undefined) {
      const s = String(b.currencyName).trim();
      if (!s || s.length > 30) return res.status(400).json({ error: 'currencyName 1..30 chars' });
      data.currencyName = s;
    }
    if (b.currencyEmoji !== undefined) {
      const s = String(b.currencyEmoji).trim();
      if (!s || s.length > 20) return res.status(400).json({ error: 'currencyEmoji invalid' });
      data.currencyEmoji = s;
    }
    const ints: [string, number, number][] = [
      ['perMessage', 0, 1000],
      ['cooldownSeconds', 0, 3600],
      ['dailyAmount', 0, 100000],
      ['streakBonus', 0, 10000],
      ['maxStreakBonus', 0, 100000],
    ];
    for (const [k, min, max] of ints) {
      if (b[k] !== undefined) {
        const n = Number(b[k]);
        if (!Number.isInteger(n) || n < min || n > max) return res.status(400).json({ error: `${k} must be ${min}..${max}` });
        data[k] = n;
      }
    }
    res.json(await updateEconomyConfig(guildId, data));
  });

  // Staff grant/deduct currency to a member.
  router.post('/grant', async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const userId = String(b.userId ?? '').trim();
    const amount = Number(b.amount);
    if (!userId) return res.status(400).json({ error: 'userId required' });
    if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 1_000_000) {
      return res.status(400).json({ error: 'amount must be a non-zero integer' });
    }
    const balance = await addCoins(prisma, guildId, userId, amount, 'admin_grant');
    res.json({ ok: true, balance });
  });

  return router;
}
