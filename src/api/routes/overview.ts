import { Router } from 'express';
import type { Client } from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../../shared/config';
import { utcDateKey } from '../../shared/analytics';

export interface OverviewDeps {
  client: Client;
  prisma: PrismaClient;
  config: Pick<AppConfig, 'guildId'>;
}

export function createOverviewRouter(deps: OverviewDeps): Router {
  const router = Router();
  const { client, prisma, config } = deps;

  router.get('/', async (_req, res) => {
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) {
      res.status(503).json({ error: 'guild not available' });
      return;
    }

    const cached = [...guild.members.cache.values()];
    const botCount = cached.filter((m) => m.user?.bot).length;

    const [activeCases, totalCases, today, recentLogs] = await Promise.all([
      prisma.moderationCase.count({ where: { guildId: config.guildId, active: true } }),
      prisma.moderationCase.count({ where: { guildId: config.guildId } }),
      prisma.dailyStat.findFirst({ where: { guildId: config.guildId, date: utcDateKey() } }),
      prisma.logEntry.findMany({
        where: { guildId: config.guildId },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
    ]);

    res.json({
      name: guild.name,
      iconUrl: guild.iconURL?.() ?? null,
      memberCount: guild.memberCount,
      botCount,
      humanCount: Math.max(guild.memberCount - botCount, 0),
      channelCount: guild.channels.cache.size,
      roleCount: guild.roles.cache.size,
      boostLevel: Number(guild.premiumTier ?? 0),
      boostCount: guild.premiumSubscriptionCount ?? 0,
      activeCases,
      totalCases,
      todayJoins: today?.joins ?? 0,
      todayMessages: today?.messages ?? 0,
      recentLogs,
    });
  });

  return router;
}
