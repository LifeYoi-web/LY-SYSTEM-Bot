import type { Request, RequestHandler } from 'express';
import type { AppConfig } from '../../shared/config';

export interface Tenant {
  guildId: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    tenant?: Tenant;
  }
}

/**
 * Resolves the request's tenant guild from the session. Mount AFTER requireStaff.
 * Legacy sessions from before A2b carry no guildIds — they keep exactly the access
 * they always had: the owner guild.
 */
export function tenantContext(config: Pick<AppConfig, 'guildId'>): RequestHandler {
  return (req, res, next) => {
    const ids = req.session?.guildIds;
    if (!ids || ids.length === 0) {
      req.tenant = { guildId: config.guildId }; // legacy session fallback
      return next();
    }
    const selected = req.session?.guildId ?? ids[0];
    if (!ids.includes(selected)) {
      res.status(403).json({ error: 'guild not accessible' });
      return;
    }
    req.tenant = { guildId: selected };
    next();
  };
}

/** The one way handlers read the tenant. Throws when tenantContext didn't run — fail closed. */
export function tenantGuildId(req: Request): string {
  const guildId = req.tenant?.guildId;
  if (!guildId) throw new Error('tenantContext missing — route mounted without tenant middleware');
  return guildId;
}
