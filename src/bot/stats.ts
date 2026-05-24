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

function keyOf(guildId: string, date = utcDateKey()): string {
  return `${guildId}|${date}`;
}

export function bump(guildId: string, field: StatField, by = 1): void {
  const key = keyOf(guildId);
  let b = buckets.get(key);
  if (!b) {
    b = { messages: 0, joins: 0, leaves: 0, modActions: 0 };
    buckets.set(key, b);
  }
  b[field] += by;
}

/**
 * Persist and clear all pending counters. `memberCounts` lets the caller record a
 * fresh member-count snapshot per guild alongside the increments.
 */
export async function flushStats(
  prisma: PrismaClient,
  memberCounts: Record<string, number> = {},
): Promise<number> {
  const entries = [...buckets.entries()];
  buckets.clear();
  let persisted = 0;
  for (const [key, b] of entries) {
    const [guildId, date] = key.split('|');
    const memberCount = memberCounts[guildId];
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
}
export function _peekStats(): Map<string, Bucket> {
  return new Map(buckets);
}
