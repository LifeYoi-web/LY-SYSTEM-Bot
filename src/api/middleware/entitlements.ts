import type { RequestHandler } from 'express';
import { getPlan } from '../../db/subscriptions';
import { hasFeature, limitFor, type FeatureKey, type LimitKey } from '../../shared/entitlements';

/**
 * 403 + { upgrade: true } when the guild's plan lacks the feature.
 * Mount AFTER requireStaff. `getGuildId` is a thunk so A2 can swap in the
 * session-selected guild without touching call sites.
 */
export function requireFeature(key: FeatureKey, getGuildId: () => string): RequestHandler {
  return async (_req, res, next) => {
    if (hasFeature(await getPlan(getGuildId()), key)) return next();
    res.status(403).json({ error: 'premium feature', upgrade: true, feature: key });
  };
}

/** The numeric cap for a guild+limit (Infinity = unlimited). For POST-handler checks. */
export async function planLimit(guildId: string, key: LimitKey): Promise<number> {
  return limitFor(await getPlan(guildId), key);
}
