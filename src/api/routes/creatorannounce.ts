import { Router } from 'express';
import type { Client } from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../../shared/config';
import { getCreatorAnnounceConfig, updateCreatorAnnounceConfig } from '../../db/community';
import { resolveYouTubeChannelId } from '../../bot/creator/youtubeFeed';
import { announceContent } from '../../bot/creator/announce';
import { optStr } from '../util';

export interface CreatorAnnounceDeps {
  client: Client;
  prisma: PrismaClient;
  config: Pick<AppConfig, 'guildId'>;
}

const MAX_TEMPLATE = 300;
const PING_MODES = ['everyone', 'here', 'role', 'none'];

export function createCreatorAnnounceRouter(deps: CreatorAnnounceDeps): Router {
  const router = Router();
  const guildId = deps.config.guildId;

  router.get('/', async (_req, res) => {
    res.json({ config: await getCreatorAnnounceConfig(guildId) });
  });

  router.put('/config', async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const current = await getCreatorAnnounceConfig(guildId);
    const data: Record<string, unknown> = {};

    if (b.enabled !== undefined) data.enabled = Boolean(b.enabled);
    if (b.channelId !== undefined) data.channelId = optStr(b.channelId);
    if (b.pingMode !== undefined) {
      const s = String(b.pingMode);
      if (!PING_MODES.includes(s)) return res.status(400).json({ error: 'invalid pingMode' });
      data.pingMode = s;
    }
    if (b.pingRoleId !== undefined) data.pingRoleId = optStr(b.pingRoleId);
    if (b.messageTemplate !== undefined) {
      const s = optStr(b.messageTemplate);
      if (s && s.length > MAX_TEMPLATE) return res.status(400).json({ error: 'messageTemplate too long' });
      data.messageTemplate = s;
    }

    if (b.youtubeEnabled !== undefined) data.youtubeEnabled = Boolean(b.youtubeEnabled);
    if (b.youtubeChannelId !== undefined) {
      const s = optStr(b.youtubeChannelId);
      if (s) {
        const resolved = await resolveYouTubeChannelId(s).catch(() => null);
        if (!resolved) {
          return res.status(400).json({ error: 'تعذّر إيجاد قناة يوتيوب — الصق رابط القناة أو معرّف UC...' });
        }
        data.youtubeChannelId = resolved;
        if (resolved !== current.youtubeChannelId) data.youtubeLastVideoId = null; // re-baseline on change
      } else {
        data.youtubeChannelId = null;
      }
    }

    if (b.tiktokEnabled !== undefined) data.tiktokEnabled = Boolean(b.tiktokEnabled);
    if (b.tiktokUsername !== undefined) {
      const s = optStr(b.tiktokUsername);
      const clean = s ? s.replace(/^@/, '').replace(/[^\w.-]/g, '').slice(0, 40) || null : null;
      data.tiktokUsername = clean;
      if (clean !== current.tiktokUsername) data.tiktokLastVideoId = null; // re-baseline on change
    }

    res.json(await updateCreatorAnnounceConfig(guildId, data));
  });

  // Send a sample announcement to the configured channel so staff can verify the channel + ping.
  router.post('/test', async (_req, res) => {
    const cfg = await getCreatorAnnounceConfig(guildId);
    if (!cfg.channelId) return res.status(400).json({ error: 'لا توجد قناة محددة' });
    const ok = await announceContent(deps.client, cfg, 'youtube', {
      id: 'test',
      title: 'فيديو تجريبي — هذا اختبار للإشعار 🎬',
      url: 'https://www.youtube.com',
      publishedAt: new Date(),
    }).catch(() => false);
    res.json({ ok });
  });

  return router;
}
