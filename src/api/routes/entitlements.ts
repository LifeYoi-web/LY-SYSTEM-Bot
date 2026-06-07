import { Router } from 'express';
import type { AppConfig } from '../../shared/config';
import { getPlan } from '../../db/subscriptions';
import { FEATURES, LIMITS, hasFeature, limitFor, type FeatureKey, type LimitKey } from '../../shared/entitlements';
import { tenantGuildId } from '../middleware/tenant';

export interface EntitlementsDeps {
  config: Pick<AppConfig, 'guildId'>;
}

/** The SPA reads this once per session to render lock badges + limit counters. */
export function createEntitlementsRouter(deps: EntitlementsDeps): Router {
  const router = Router();
  router.get('/', async (req, res) => {
    const guildId = tenantGuildId(req);
    const plan = await getPlan(guildId);
    const features = Object.fromEntries(
      (Object.keys(FEATURES) as FeatureKey[]).map((k) => [k, hasFeature(plan, k)]),
    );
    const limits = Object.fromEntries(
      (Object.keys(LIMITS) as LimitKey[]).map((k) => {
        const v = limitFor(plan, k);
        return [k, Number.isFinite(v) ? v : null]; // Infinity is not JSON — null = unlimited
      }),
    );
    res.json({ plan, features, limits });
  });
  return router;
}
