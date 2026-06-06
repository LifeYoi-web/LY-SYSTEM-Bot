import type { Client } from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import { getCreatorAnnounceConfig, updateCreatorAnnounceConfig } from '../../db/community';
import { logger } from '../../shared/logger';
import { fetchYouTubeUploads } from './youtubeFeed';
import { fetchTikTokUploads } from './tiktok';
import { announceContent } from './announce';
import type { ContentItem, Platform } from './types';
import { featureAllowed } from '../premium';

export const YT_INTERVAL_MS = 5 * 60_000; // YouTube RSS is free; poll every 5 min
export const TT_INTERVAL_MS = 10 * 60_000; // TikTok costs RapidAPI quota; poll every 10 min
const MAX_PER_POLL = 3; // cap announcements per poll so we never flood on a stale baseline

export interface CreatorPollDeps {
  client: Client;
  prisma: PrismaClient;
  guildId: string;
  rapidApiKey?: string;
  rapidApiTikTokHost?: string;
}

/** Whether enough time has elapsed since the last poll of a source. */
export function dueFor(last: Date | null | undefined, now: Date, intervalMs: number): boolean {
  if (!last) return true;
  return now.getTime() - new Date(last).getTime() >= intervalMs;
}

/**
 * Decide which feed items to announce given the last-announced id.
 * Items must be newest-first. A null lastId means "first run": adopt the newest as the
 * baseline and announce nothing (so enabling the feature never floods the backlog).
 * Returns items oldest-first so they post in chronological order.
 */
export function selectNewItems(
  items: ContentItem[],
  lastId: string | null,
  cap = MAX_PER_POLL,
): { toAnnounce: ContentItem[]; newLastId: string | null } {
  if (!items.length) return { toAnnounce: [], newLastId: lastId };
  const newest = items[0].id;
  if (lastId == null) return { toAnnounce: [], newLastId: newest };
  const idx = items.findIndex((i) => i.id === lastId);
  const fresh = (idx === -1 ? items.slice(0, cap) : items.slice(0, idx)).slice(0, cap);
  return { toAnnounce: [...fresh].reverse(), newLastId: newest };
}

async function pollSource(
  deps: CreatorPollDeps,
  platform: Platform,
  fetchItems: () => Promise<ContentItem[]>,
  lastVideoId: string | null,
  lastIdField: 'youtubeLastVideoId' | 'tiktokLastVideoId',
  pollField: 'lastPolledYt' | 'lastPolledTt',
  cfg: Awaited<ReturnType<typeof getCreatorAnnounceConfig>>,
  now: Date,
): Promise<number> {
  let announced = 0;
  try {
    const items = await fetchItems();
    const { toAnnounce, newLastId } = selectNewItems(items, lastVideoId);
    for (const it of toAnnounce) {
      if (await announceContent(deps.client, cfg, platform, it)) announced++;
    }
    await updateCreatorAnnounceConfig(deps.guildId, { [lastIdField]: newLastId, [pollField]: now });
  } catch (err) {
    logger.error(`Creator ${platform} poll error: ${err}`);
    // Still record the attempt so a flaky source doesn't get hammered every tick.
    await updateCreatorAnnounceConfig(deps.guildId, { [pollField]: now }).catch(() => undefined);
  }
  return announced;
}

/** Scheduler task: poll enabled creator sources and announce new uploads. */
export async function pollCreatorContent(deps: CreatorPollDeps, now: Date = new Date()): Promise<number> {
  if (!(await featureAllowed(deps.guildId, 'creatorAlerts'))) return 0;
  const cfg = await getCreatorAnnounceConfig(deps.guildId);
  if (!cfg.enabled || !cfg.channelId) return 0;
  let announced = 0;

  if (cfg.youtubeEnabled && cfg.youtubeChannelId && dueFor(cfg.lastPolledYt, now, YT_INTERVAL_MS)) {
    announced += await pollSource(
      deps,
      'youtube',
      () => fetchYouTubeUploads(cfg.youtubeChannelId as string),
      cfg.youtubeLastVideoId,
      'youtubeLastVideoId',
      'lastPolledYt',
      cfg,
      now,
    );
  }

  if (
    cfg.tiktokEnabled &&
    cfg.tiktokUsername &&
    deps.rapidApiKey &&
    dueFor(cfg.lastPolledTt, now, TT_INTERVAL_MS)
  ) {
    announced += await pollSource(
      deps,
      'tiktok',
      () =>
        fetchTikTokUploads(
          cfg.tiktokUsername as string,
          deps.rapidApiKey as string,
          deps.rapidApiTikTokHost,
        ),
      cfg.tiktokLastVideoId,
      'tiktokLastVideoId',
      'lastPolledTt',
      cfg,
      now,
    );
  }

  return announced;
}
