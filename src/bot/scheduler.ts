import type { Client } from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import { liftCase, type ActionDeps, type GuildLike } from './moderation/actions';
import { flushStats } from './stats';
import {
  endDueGiveaways,
  fireDueReminders,
  announceBirthdays,
  refreshStatCounters,
  expireShopRoles,
  sweepRaids,
  postWeeklyDigest,
  runChurnAlerts,
  pruneOldTranscripts,
} from './scheduler-tasks';
import { sweepVoiceXp } from './voiceXp';
import { pollCreatorContent } from './creator/poll';
import { logger } from '../shared/logger';

/** Lift (unban/untimeout) cases whose expiry passed — strictly for ONE guild (fleet-safety). */
export async function liftExpiredCases(deps: ActionDeps, guildId: string): Promise<number> {
  const expired = await deps.prisma.moderationCase.findMany({
    where: { guildId, active: true, expiresAt: { not: null, lte: new Date() } },
  });
  for (const c of expired) {
    await liftCase(deps, c.id);
  }
  return expired.length;
}

export interface SchedulerDeps {
  client: Client;
  prisma: PrismaClient;
  guildId: string;
  /** Optional RapidAPI creds enabling the TikTok creator-announce source. */
  rapidApiKey?: string;
  rapidApiTikTokHost?: string;
}

/** Next fire time for a repeating schedule, or null for a one-off. Skips past missed runs. */
export function computeNextRun(runAt: Date, repeat: string, now: Date = new Date()): Date | null {
  if (repeat !== 'daily' && repeat !== 'weekly') return null;
  const stepDays = repeat === 'weekly' ? 7 : 1;
  const next = new Date(runAt);
  do {
    next.setUTCDate(next.getUTCDate() + stepDays);
  } while (next <= now);
  return next;
}

export async function postDueScheduled(deps: SchedulerDeps, now: Date = new Date()): Promise<number> {
  const due = await deps.prisma.scheduledMessage.findMany({
    where: { guildId: deps.guildId, enabled: true, runAt: { lte: now } },
  });
  for (const m of due) {
    const channel = deps.client.channels.cache.get(m.channelId) as
      | { send?: (payload: unknown) => Promise<unknown> }
      | undefined;
    await channel?.send?.({ content: m.content, allowedMentions: { parse: ['users', 'roles'] } }).catch(() => undefined);
    const next = computeNextRun(m.runAt, m.repeat, now);
    await deps.prisma.scheduledMessage.update({
      where: { id: m.id },
      data: next ? { runAt: next, lastRunAt: now } : { enabled: false, lastRunAt: now },
    });
  }
  return due.length;
}

/** Throttle/once-per-day bookkeeping carried across ticks (one per tenant in the fleet). */
export interface TickState {
  lastStatRefresh: number;
  lastBirthdayKey: string;
  lastTrendCheck: number;
  lastTranscriptPruneKey: string;
}

export function createTickState(): TickState {
  return { lastStatRefresh: 0, lastBirthdayKey: '', lastTrendCheck: 0, lastTranscriptPruneKey: '' };
}

/** One scheduler pass for one tenant guild. Exported so tests can run a single tick. */
export async function runSchedulerTick(deps: SchedulerDeps, state: TickState): Promise<void> {
  // Flush buffered activity counters — strictly the tenant guild (fleet-safety).
  const tenantGuild = deps.client.guilds.cache.get(deps.guildId);
  await flushStats(deps.prisma, deps.guildId, tenantGuild?.memberCount).catch((err) =>
    logger.error(`Stats flush error: ${err}`),
  );

  const posted = await postDueScheduled(deps).catch((err) => {
    logger.error(`Scheduled post error: ${err}`);
    return 0;
  });
  if (posted > 0) logger.info(`Scheduler posted ${posted} scheduled message(s)`);

  // Time-based community tasks.
  await endDueGiveaways(deps).catch((err) => logger.error(`Giveaway end error: ${err}`));
  await fireDueReminders(deps).catch((err) => logger.error(`Reminder error: ${err}`));

  // Voice-activity XP (pro-rated to the elapsed tick), temp-role expiry, raid lock auto-lift.
  await sweepVoiceXp(deps.client, deps.prisma, deps.guildId).catch((err) => logger.error(`Voice XP error: ${err}`));
  await expireShopRoles(deps).catch((err) => logger.error(`Shop expiry error: ${err}`));
  await sweepRaids(deps).catch(() => undefined);

  // Aggregate-trend tasks (weekly digest + churn alerts), throttled to ~30 min.
  if (Date.now() - state.lastTrendCheck > 1_800_000) {
    state.lastTrendCheck = Date.now();
    await postWeeklyDigest(deps).catch((err) => logger.error(`Digest error: ${err}`));
    await runChurnAlerts(deps).catch((err) => logger.error(`Alerts error: ${err}`));
  }

  // Creator content (YouTube/TikTok new uploads). Self-throttles per source inside the task.
  const newVids = await pollCreatorContent(deps).catch((err) => {
    logger.error(`Creator poll error: ${err}`);
    return 0;
  });
  if (newVids > 0) logger.info(`Scheduler announced ${newVids} new creator upload(s)`);

  // Stat-counter channels: throttled to ~10 min (Discord rate-limits channel renames).
  if (Date.now() - state.lastStatRefresh > 600_000) {
    state.lastStatRefresh = Date.now();
    await refreshStatCounters(deps).catch((err) => logger.error(`StatCounter error: ${err}`));
  }
  // Birthdays: once per UTC day (re-announces on restart, which is acceptable).
  const dayKey = new Date().toISOString().slice(0, 10);
  if (dayKey !== state.lastBirthdayKey) {
    state.lastBirthdayKey = dayKey;
    await announceBirthdays(deps).catch((err) => logger.error(`Birthday error: ${err}`));
  }

  // Transcript retention (free tier): once per UTC day.
  if (dayKey !== state.lastTranscriptPruneKey) {
    state.lastTranscriptPruneKey = dayKey;
    await pruneOldTranscripts(deps).catch((err) => logger.error(`Transcript prune error: ${err}`));
  }

  const guild = deps.client.guilds.cache.get(deps.guildId);
  if (!guild) return;
  try {
    const n = await liftExpiredCases({ guild: guild as unknown as GuildLike, prisma: deps.prisma }, deps.guildId);
    if (n > 0) logger.info(`Scheduler lifted ${n} expired case(s)`);
  } catch (err) {
    logger.error(`Scheduler error: ${err}`);
  }
}

export function startScheduler(deps: SchedulerDeps, intervalMs = 60_000): NodeJS.Timeout {
  const state = createTickState();
  const handle = setInterval(() => void runSchedulerTick(deps, state), intervalMs);
  handle.unref?.();
  return handle;
}
