import type { RequestHandler } from 'express';
import { getPlan } from '../../db/subscriptions';
import { hasFeature, limitFor, type FeatureKey, type LimitKey } from '../../shared/entitlements';

/**
 * 403 + { upgrade: true } when the guild's plan lacks the feature.
 * Mount AFTER requireStaff + tenantContext. `getGuildId` receives the request so
 * callers can pass `(req) => tenantGuildId(req)` for tenant-aware checks.
 * A zero-arg thunk `() => 'g1'` remains assignable (TS allows fewer params).
 */
export function requireFeature(key: FeatureKey, getGuildId: (req: Parameters<RequestHandler>[0]) => string): RequestHandler {
  return async (req, res, next) => {
    if (hasFeature(await getPlan(getGuildId(req)), key)) return next();
    res.status(403).json({ error: 'premium feature', upgrade: true, feature: key });
  };
}

/** The numeric cap for a guild+limit (Infinity = unlimited). For POST-handler checks. */
export async function planLimit(guildId: string, key: LimitKey): Promise<number> {
  return limitFor(await getPlan(guildId), key);
}
