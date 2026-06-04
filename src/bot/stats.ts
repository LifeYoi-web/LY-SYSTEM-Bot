import type { PrismaClient } from '@prisma/client';
import { utcDateKey } from '../shared/analytics';

export type StatField = 'messages' | 'joins' | 'leaves' | 'modActions';

interface Bucket {
  messages: number;
  joins: number;
  leaves: number;
  modActions: number;
}

// In-memory per-guild/per-day counters. Events bump these cheaply; the scheduler
// flushes them to DailyStat periodically so we never write a DB row per message.
const buckets = new Map<string, Bucket>();

// Fleet-safety guard (SaaS Phase 0, spec §6.5): events fire for ANY guild a bot
// was invited to — only configured tenant guilds may ever be counted.
const allowedGuilds = new Set<string>();

/** Register a guild whose activity may be counted (called once per tenant at startup). */
export function allowStatsGuild(guildId: string): void {
  allowedGuilds.add(guildId);
}

function keyOf(guildId: string, date = utcDateKey()): string {
  return `${guildId}|${date}`;
}

export function bump(guildId: string, field: StatField, by = 1): void {
  if (!allowedGuilds.has(guildId)) return;
  const key = keyOf(guildId);
  let b = buckets.get(key);
  if (!b) {
    b = { messages: 0, joins: 0, leaves: 0, modActions: 0 };
    buckets.set(key, b);
  }
  b[field] += by;
}

/**
 * Persist and clear pending counters for ONE guild (other tenants' buckets stay
 * buffered for their own tick). `memberCount` records a fresh snapshot alongside
 * the increments.
 */
export async function flushStats(
  prisma: PrismaClient,
  guildId: string,
  memberCount?: number,
): Promise<number> {
  const prefix = `${guildId}|`;
  const entries = [...buckets.entries()].filter(([key]) => key.startsWith(prefix));
  let persisted = 0;
  for (const [key, b] of entries) {
    buckets.delete(key);
    const date = key.slice(prefix.length);
    try {
      await prisma.dailyStat.upsert({
        where: { guildId_date: { guildId, date } },
        create: { guildId, date, ...b, memberCount: memberCount ?? 0 },
        update: {
          messages: { increment: b.messages },
          joins: { increment: b.joins },
          leaves: { increment: b.leaves },
          modActions: { increment: b.modActions },
          ...(memberCount != null ? { memberCount } : {}),
        },
      });
      persisted++;
    } catch {
      // Persist failed (e.g. transient DB error): merge counts back so the next
      // flush retries them instead of silently dropping the day's activity.
      const cur = buckets.get(key);
      if (cur) {
        cur.messages += b.messages;
        cur.joins += b.joins;
        cur.leaves += b.leaves;
        cur.modActions += b.modActions;
      } else {
        buckets.set(key, { ...b });
      }
    }
  }
  return persisted;
}

/** Test helpers. */
export function _resetStats(): void {
  buckets.clear();
  allowedGuilds.clear();
}
export function _peekStats(): Map<string, Bucket> {
  return new Map(buckets);
}
