import type { Client } from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import { liftCase, type ActionDeps, type GuildLike } from './moderation/actions';
import { logger } from '../shared/logger';

export async function liftExpiredCases(deps: ActionDeps): Promise<number> {
  const expired = await deps.prisma.moderationCase.findMany({
    where: { active: true, expiresAt: { not: null, lte: new Date() } },
  });
  for (const c of expired) {
    await liftCase(deps, c.id);
  }
  return expired.length;
}

export interface SchedulerDeps {
  client: Client;
  prisma: PrismaClient;
  guildId: string;
}

export function startScheduler(deps: SchedulerDeps, intervalMs = 60_000): NodeJS.Timeout {
  const tick = async () => {
    const guild = deps.client.guilds.cache.get(deps.guildId);
    if (!guild) return;
    try {
      const n = await liftExpiredCases({ guild: guild as unknown as GuildLike, prisma: deps.prisma });
      if (n > 0) logger.info(`Scheduler lifted ${n} expired case(s)`);
    } catch (err) {
      logger.error(`Scheduler error: ${err}`);
    }
  };
  const handle = setInterval(tick, intervalMs);
  handle.unref?.();
  return handle;
}
