import type { RequestHandler } from 'express';
import type { AppConfig } from '../../shared/config';
import { logger } from '../../shared/logger';

/** Owner-only routes (bot identity/restart, future fleet/payment approval). Fail closed without OWNER_DISCORD_ID. */
export function requireOwner(config: Pick<AppConfig, 'ownerDiscordId'>): RequestHandler {
  return (req, res, next) => {
    const ownerId = config.ownerDiscordId;
    if (ownerId && req.session?.user?.authorized && req.session.user.id === ownerId) return next();
    // Security observability: denied owner-route attempts are worth a trace.
    logger.warning(
      `Owner-route denied for user ${req.session?.user?.id ?? 'anonymous'} on ${req.method} ${req.originalUrl}${ownerId ? '' : ' (OWNER_DISCORD_ID unset)'}`,
    );
    res.status(403).json({ error: 'owner only' });
  };
}
