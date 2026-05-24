import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../../shared/config';
import { buildDateSeries, lastNDates, clamp } from '../../shared/analytics';

export interface AnalyticsDeps {
  prisma: PrismaClient;
  config: Pick<AppConfig, 'guildId'>;
}

export function createAnalyticsRouter(deps: AnalyticsDeps): Router {
  const router = Router();
  const { prisma, config } = deps;

  router.get('/', async (req, res) => {
    const days = clamp(Number(req.query.days ?? 14), 7, 90);
    const dates = lastNDates(days);

    const [stats, caseGroups, modGroups] = await Promise.all([
      prisma.dailyStat.findMany({
        where: { guildId: config.guildId, date: { in: dates } },
      }),
      prisma.moderationCase.groupBy({
        by: ['type'],
        where: { guildId: config.guildId },
        _count: { type: true },
      }),
      prisma.moderationCase.groupBy({
        by: ['moderatorId'],
        where: { guildId: config.guildId },
        _count: { moderatorId: true },
        orderBy: { _count: { moderatorId: 'desc' } },
        take: 5,
      }),
    ]);

    const series = buildDateSeries(stats, days);
    const totals = series.reduce(
      (a, d) => ({
        messages: a.messages + d.messages,
        joins: a.joins + d.joins,
        leaves: a.leaves + d.leaves,
        modActions: a.modActions + d.modActions,
      }),
      { messages: 0, joins: 0, leaves: 0, modActions: 0 },
    );

    res.json({
      days,
      series,
      totals,
      caseDistribution: caseGroups.map((g) => ({ type: g.type, count: g._count.type })),
      topModerators: modGroups.map((g) => ({
        moderatorId: g.moderatorId,
        count: g._count.moderatorId,
      })),
    });
  });

  return router;
}
