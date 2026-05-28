import { prisma } from './prisma';
import type {
  StarboardConfig,
  CountingConfig,
  SuggestionConfig,
  TicketConfig,
  TicketType,
  BirthdayConfig,
  ReportConfig,
  TempVoiceConfig,
  Highlight,
} from '@prisma/client';

/** Cache for a single-row-per-guild config that is upserted-on-read. */
function singleRowCache<T>(
  loader: (guildId: string) => Promise<T>,
  updater: (guildId: string, data: Record<string, unknown>) => Promise<T>,
) {
  const cache = new Map<string, T>();
  return {
    get: async (guildId: string): Promise<T> => {
      const c = cache.get(guildId);
      if (c) return c;
      const v = await loader(guildId);
      cache.set(guildId, v);
      return v;
    },
    update: async (guildId: string, data: Record<string, unknown>): Promise<T> => {
      const v = await updater(guildId, data);
      cache.set(guildId, v);
      return v;
    },
    invalidate: (guildId: string) => cache.delete(guildId),
  };
}

const starboard = singleRowCache<StarboardConfig>(
  (g) => prisma.starboardConfig.upsert({ where: { guildId: g }, update: {}, create: { guildId: g } }),
  (g, d) => prisma.starboardConfig.upsert({ where: { guildId: g }, update: d, create: { guildId: g, ...d } }),
);
export const getStarboard = starboard.get;
export const updateStarboard = starboard.update;

const counting = singleRowCache<CountingConfig>(
  (g) => prisma.countingConfig.upsert({ where: { guildId: g }, update: {}, create: { guildId: g } }),
  (g, d) => prisma.countingConfig.upsert({ where: { guildId: g }, update: d, create: { guildId: g, ...d } }),
);
export const getCounting = counting.get;
export const updateCounting = counting.update;

const suggestionCfg = singleRowCache<SuggestionConfig>(
  (g) => prisma.suggestionConfig.upsert({ where: { guildId: g }, update: {}, create: { guildId: g } }),
  (g, d) => prisma.suggestionConfig.upsert({ where: { guildId: g }, update: d, create: { guildId: g, ...d } }),
);
export const getSuggestionConfig = suggestionCfg.get;
export const updateSuggestionConfig = suggestionCfg.update;

const ticketCfg = singleRowCache<TicketConfig>(
  (g) => prisma.ticketConfig.upsert({ where: { guildId: g }, update: {}, create: { guildId: g } }),
  (g, d) => prisma.ticketConfig.upsert({ where: { guildId: g }, update: d, create: { guildId: g, ...d } }),
);
export const getTicketConfig = ticketCfg.get;
export const updateTicketConfig = ticketCfg.update;
export const invalidateTicketConfig = ticketCfg.invalidate;

// ---- Ticket types (cached list per guild, ordered by position) ----
const ticketTypesCache = new Map<string, TicketType[]>();
export async function getTicketTypes(guildId: string): Promise<TicketType[]> {
  const c = ticketTypesCache.get(guildId);
  if (c) return c;
  const list = await prisma.ticketType.findMany({ where: { guildId }, orderBy: { position: 'asc' } });
  ticketTypesCache.set(guildId, list);
  return list;
}
export function invalidateTicketTypes(guildId: string): void {
  ticketTypesCache.delete(guildId);
}

const birthdayCfg = singleRowCache<BirthdayConfig>(
  (g) => prisma.birthdayConfig.upsert({ where: { guildId: g }, update: {}, create: { guildId: g } }),
  (g, d) => prisma.birthdayConfig.upsert({ where: { guildId: g }, update: d, create: { guildId: g, ...d } }),
);
export const getBirthdayConfig = birthdayCfg.get;
export const updateBirthdayConfig = birthdayCfg.update;

const reportCfg = singleRowCache<ReportConfig>(
  (g) => prisma.reportConfig.upsert({ where: { guildId: g }, update: {}, create: { guildId: g } }),
  (g, d) => prisma.reportConfig.upsert({ where: { guildId: g }, update: d, create: { guildId: g, ...d } }),
);
export const getReportConfig = reportCfg.get;
export const updateReportConfig = reportCfg.update;

const tempVoiceCfg = singleRowCache<TempVoiceConfig>(
  (g) => prisma.tempVoiceConfig.upsert({ where: { guildId: g }, update: {}, create: { guildId: g } }),
  (g, d) => prisma.tempVoiceConfig.upsert({ where: { guildId: g }, update: d, create: { guildId: g, ...d } }),
);
export const getTempVoiceConfig = tempVoiceCfg.get;
export const updateTempVoiceConfig = tempVoiceCfg.update;

// ---- Highlights (cached list per guild) ----
const hlCache = new Map<string, Highlight[]>();
export async function getHighlights(guildId: string): Promise<Highlight[]> {
  const c = hlCache.get(guildId);
  if (c) return c;
  const list = await prisma.highlight.findMany({ where: { guildId } });
  hlCache.set(guildId, list);
  return list;
}
export function invalidateHighlights(guildId: string): void {
  hlCache.delete(guildId);
}

// ---- Sticky channels (cached set of channelIds with an enabled sticky) ----
const stickyCache = new Map<string, Set<string>>();
export async function getStickyChannels(guildId: string): Promise<Set<string>> {
  const c = stickyCache.get(guildId);
  if (c) return c;
  const rows = await prisma.stickyMessage.findMany({ where: { guildId, enabled: true } });
  const set = new Set(rows.map((r) => r.channelId));
  stickyCache.set(guildId, set);
  return set;
}
export function invalidateSticky(guildId: string): void {
  stickyCache.delete(guildId);
}

// ---- AFK (cached per-guild map, lazy-loaded) ----
interface AfkState {
  reason: string;
  since: Date;
}
const afkCache = new Map<string, Map<string, AfkState>>();
async function ensureAfk(guildId: string): Promise<Map<string, AfkState>> {
  let m = afkCache.get(guildId);
  if (m) return m;
  const rows = await prisma.afk.findMany({ where: { guildId } });
  m = new Map(rows.map((r) => [r.userId, { reason: r.reason, since: r.since }]));
  afkCache.set(guildId, m);
  return m;
}
export async function getAfk(guildId: string, userId: string): Promise<AfkState | null> {
  return (await ensureAfk(guildId)).get(userId) ?? null;
}
export async function setAfk(guildId: string, userId: string, reason: string): Promise<void> {
  const m = await ensureAfk(guildId);
  const since = new Date();
  await prisma.afk.upsert({
    where: { guildId_userId: { guildId, userId } },
    create: { guildId, userId, reason, since },
    update: { reason, since },
  });
  m.set(userId, { reason, since });
}
export async function clearAfk(guildId: string, userId: string): Promise<AfkState | null> {
  const m = await ensureAfk(guildId);
  const existing = m.get(userId);
  if (!existing) return null;
  m.delete(userId);
  await prisma.afk.delete({ where: { guildId_userId: { guildId, userId } } }).catch(() => undefined);
  return existing;
}
