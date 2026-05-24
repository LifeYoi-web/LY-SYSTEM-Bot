import { prisma } from './prisma';
import type { AutoResponse } from '@prisma/client';

// Read on every message, so the enabled set is cached per guild.
const cache = new Map<string, AutoResponse[]>();

export async function getAutoResponses(guildId: string): Promise<AutoResponse[]> {
  const cached = cache.get(guildId);
  if (cached) return cached;
  const list = await prisma.autoResponse.findMany({ where: { guildId, enabled: true } });
  cache.set(guildId, list);
  return list;
}

export function invalidateAutoResponses(guildId: string): void {
  cache.delete(guildId);
}

export type MatchType = 'contains' | 'exact' | 'startswith';

/** First enabled auto-response whose trigger matches, or null. */
export function matchAutoResponse(content: string, responses: AutoResponse[]): AutoResponse | null {
  const text = content.toLowerCase().trim();
  if (!text) return null;
  for (const r of responses) {
    const trig = r.trigger.toLowerCase().trim();
    if (!trig) continue;
    if (r.matchType === 'exact' && text === trig) return r;
    if (r.matchType === 'startswith' && text.startsWith(trig)) return r;
    if (r.matchType === 'contains' && text.includes(trig)) return r;
  }
  return null;
}
