import type { RequestHandler } from 'express';
import type { AppConfig } from '../../shared/config';

/** Owner-only routes (bot identity/restart, future fleet/payment approval). Fail closed without OWNER_DISCORD_ID. */
export function requireOwner(config: Pick<AppConfig, 'ownerDiscordId'>): RequestHandler {
  return (req, res, next) => {
    const ownerId = config.ownerDiscordId;
    if (ownerId && req.session?.user?.authorized && req.session.user.id === ownerId) return next();
    res.status(403).json({ error: 'owner only' });
  };
}
