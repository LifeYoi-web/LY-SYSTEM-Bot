import { prisma } from './prisma';
import type { Plan } from '../shared/entitlements';
export type { Plan };

const TTL_MS = 5 * 60_000;

/** TTL cache: evicted after 5 min and on explicit invalidation. */
const cache = new Map<string, { plan: Plan; at: number }>();

/**
 * Last-known plan: populated whenever we successfully read from DB.
 * NOT cleared by invalidatePlan — it is the fail-open safety net so a paying
 * guild never loses its plan on a transient DB error, even across invalidations.
 */
const lastKnown = new Map<string, Plan>();

function asPlan(value: string | undefined | null): Plan {
  return value === 'premium' || value === 'custom' ? value : 'free';
}

/**
 * A guild's plan, cached ~5 min. Fail-open: on a DB error the last-known plan
 * (from any prior successful read) is served — a paying guild must never lose
 * premium on an infra blip. A cold cache with no prior read and a DB error fails
 * safe to 'free'.
 */
export async function getPlan(guildId: string): Promise<Plan> {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.plan;
  try {
    const row = await prisma.subscription.findUnique({ where: { guildId } });
    const plan = asPlan(row?.plan);
    cache.set(guildId, { plan, at: Date.now() });
    lastKnown.set(guildId, plan);
    return plan;
  } catch {
    if (hit) {
      hit.at = Date.now(); // serve stale, retry next TTL
      return hit.plan;
    }
    // No live TTL entry — fall back to last-known (fail-open for paying guilds)
    const known = lastKnown.get(guildId);
    if (known !== undefined) return known;
    return 'free';
  }
}

/** Owner/dashboard writes a plan; TTL cache invalidated so the change is immediate. */
export async function setPlan(guildId: string, plan: Plan): Promise<void> {
  await prisma.subscription.upsert({ where: { guildId }, update: { plan }, create: { guildId, plan } });
  invalidatePlan(guildId);
}

/** Boot seeding: the owner guild gets a lifetime 'custom' row — created once, never overwritten. */
export async function seedOwnerPlan(guildId: string): Promise<void> {
  await prisma.subscription.upsert({ where: { guildId }, update: {}, create: { guildId, plan: 'custom' } });
  invalidatePlan(guildId);
}

/** Evicts the TTL cache entry, forcing a fresh DB read on next getPlan. */
export function invalidatePlan(guildId: string): void {
  cache.delete(guildId);
}

/** Test helper — clears both caches. */
export function _resetPlans(): void {
  cache.clear();
  lastKnown.clear();
}
