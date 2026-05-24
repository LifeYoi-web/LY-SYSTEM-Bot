import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../../shared/config';
import { clamp } from '../../shared/analytics';

export interface LogsDeps {
  prisma: PrismaClient;
  config: Pick<AppConfig, 'guildId'>;
}

export function createLogsRouter(deps: LogsDeps): Router {
  const router = Router();
  const { prisma, config } = deps;

  router.get('/', async (req, res) => {
    const type = req.query.type ? String(req.query.type) : undefined;
    const limit = clamp(Number(req.query.limit ?? 25), 1, 100);
    const page = Math.max(Math.trunc(Number(req.query.page ?? 1)) || 1, 1);
    const where = { guildId: config.guildId, ...(type ? { type } : {}) };

    const [logs, total] = await Promise.all([
      prisma.logEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
      }),
      prisma.logEntry.count({ where }),
    ]);

    res.json({ logs, total, page, limit, pages: Math.max(Math.ceil(total / limit), 1) });
  });

  return router;
}
