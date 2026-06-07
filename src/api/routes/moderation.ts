import { Router, type Response, type Request } from 'express';
import type { Client } from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../../shared/config';
import {
  banUser,
  kickUser,
  muteUser,
  warnUser,
  liftCase,
  type ActionDeps,
  type GuildLike,
} from '../../bot/moderation/actions';
import { makeModNotifier } from '../../bot/moderation/notify';
import { logger } from '../../shared/logger';
import { tenantGuildId } from '../middleware/tenant';

export interface ModerationDeps {
  client: Client;
  prisma: PrismaClient;
  config: Pick<AppConfig, 'guildId'>;
}

const MAX_MUTE_SECONDS = 2_419_200; // Discord timeout cap = 28 days

export function createModerationRouter(deps: ModerationDeps): Router {
  const router = Router();

  function resolveAction(guildId: string, res: Response): ActionDeps | null {
    const guild = deps.client.guilds.cache.get(guildId);
    if (!guild) {
      res.status(503).json({ error: 'guild not available' });
      return null;
    }
    return {
      guild: guild as unknown as GuildLike,
      prisma: deps.prisma,
      notify: makeModNotifier(deps.client, guild.name),
    };
  }

  const moderatorId = (req: Request): string => req.session?.user?.id ?? 'unknown';

  router.post('/ban', async (req, res) => {
    const guildId = tenantGuildId(req);
    const { userId, reason, deleteMessageSeconds, expiresAt } = req.body ?? {};
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const action = resolveAction(guildId, res);
    if (!action) return;
    try {
      const created = await banUser(action, {
        guildId,
        targetUserId: String(userId),
        moderatorId: moderatorId(req),
        reason,
        deleteMessageSeconds: deleteMessageSeconds != null ? Number(deleteMessageSeconds) : undefined,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      });
      res.status(201).json(created);
    } catch (err) {
      logger.error(`ban failed: ${err}`);
      res.status(502).json({ error: 'discord action failed' });
    }
  });

  router.post('/kick', async (req, res) => {
    const guildId = tenantGuildId(req);
    const { userId, reason } = req.body ?? {};
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const action = resolveAction(guildId, res);
    if (!action) return;
    try {
      const created = await kickUser(action, {
        guildId,
        targetUserId: String(userId),
        moderatorId: moderatorId(req),
        reason,
      });
      res.status(201).json(created);
    } catch (err) {
      logger.error(`kick failed: ${err}`);
      res.status(502).json({ error: 'discord action failed' });
    }
  });

  router.post('/mute', async (req, res) => {
    const guildId = tenantGuildId(req);
    const { userId, reason, seconds } = req.body ?? {};
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const secs = Number(seconds);
    if (!Number.isFinite(secs) || secs <= 0 || secs > MAX_MUTE_SECONDS) {
      return res.status(400).json({ error: `seconds must be 1..${MAX_MUTE_SECONDS}` });
    }
    const action = resolveAction(guildId, res);
    if (!action) return;
    try {
      const created = await muteUser(action, {
        guildId,
        targetUserId: String(userId),
        moderatorId: moderatorId(req),
        reason,
        seconds: secs,
      });
      res.status(201).json(created);
    } catch (err) {
      logger.error(`mute failed: ${err}`);
      res.status(502).json({ error: 'discord action failed' });
    }
  });

  router.post('/warn', async (req, res) => {
    const guildId = tenantGuildId(req);
    const { userId, reason } = req.body ?? {};
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const action = resolveAction(guildId, res);
    if (!action) return;
    const created = await warnUser(action, {
      guildId,
      targetUserId: String(userId),
      moderatorId: moderatorId(req),
      reason,
    });
    res.status(201).json(created);
  });

  router.get('/cases', async (req, res) => {
    const guildId = tenantGuildId(req);
    const userId = req.query.userId ? String(req.query.userId) : undefined;
    const cases = await deps.prisma.moderationCase.findMany({
      where: { guildId, ...(userId ? { targetUserId: userId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(cases);
  });

  router.delete('/cases/:id', async (req, res) => {
    const guildId = tenantGuildId(req);
    const action = resolveAction(guildId, res);
    if (!action) return;
    const lifted = await liftCase(action, req.params.id);
    if (!lifted) return res.status(404).json({ error: 'case not found' });
    res.json(lifted);
  });

  return router;
}
