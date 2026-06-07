import { Router } from 'express';
import { ChannelType, type Client } from 'discord.js';
import type { AppConfig } from '../../shared/config';
import { tenantGuildId } from '../middleware/tenant';

export interface ServerDeps {
  client: Client;
  config: Pick<AppConfig, 'guildId'>;
}

function channelKind(type: number): string {
  switch (type) {
    case ChannelType.GuildText:
      return 'text';
    case ChannelType.GuildVoice:
      return 'voice';
    case ChannelType.GuildCategory:
      return 'category';
    case ChannelType.GuildAnnouncement:
      return 'announcement';
    case ChannelType.GuildStageVoice:
      return 'stage';
    case ChannelType.GuildForum:
      return 'forum';
    default:
      return 'other';
  }
}

function hexColor(c?: number | null): string | null {
  if (!c) return null;
  return '#' + c.toString(16).padStart(6, '0');
}

export function createServerRouter(deps: ServerDeps): Router {
  const router = Router();
  const { client } = deps;

  function guild(guildId: string, res: import('express').Response) {
    const g = client.guilds.cache.get(guildId);
    if (!g) {
      res.status(503).json({ error: 'guild not available' });
      return null;
    }
    return g;
  }

  router.get('/', (req, res) => {
    const guildId = tenantGuildId(req);
    const g = guild(guildId, res);
    if (!g) return;
    const channels = [...g.channels.cache.values()];
    const byType: Record<string, number> = {};
    for (const c of channels) {
      const k = channelKind((c as { type: number }).type);
      byType[k] = (byType[k] ?? 0) + 1;
    }
    res.json({
      id: g.id,
      name: g.name,
      iconUrl: g.iconURL?.() ?? null,
      memberCount: g.memberCount,
      channelCount: channels.length,
      roleCount: g.roles.cache.size,
      emojiCount: g.emojis?.cache?.size ?? 0,
      boostLevel: Number(g.premiumTier ?? 0),
      boostCount: g.premiumSubscriptionCount ?? 0,
      ownerId: g.ownerId,
      createdTimestamp: g.createdTimestamp ?? null,
      channelsByType: byType,
    });
  });

  router.get('/channels', (req, res) => {
    const guildId = tenantGuildId(req);
    const g = guild(guildId, res);
    if (!g) return;
    const channels = [...g.channels.cache.values()]
      .map((c) => {
        const ch = c as { id: string; name: string; type: number; parentId?: string | null; rawPosition?: number; position?: number };
        return {
          id: ch.id,
          name: ch.name,
          kind: channelKind(ch.type),
          parentId: ch.parentId ?? null,
          position: ch.rawPosition ?? ch.position ?? 0,
        };
      })
      .sort((a, b) => a.position - b.position);
    res.json({ channels });
  });

  router.get('/roles', (req, res) => {
    const guildId = tenantGuildId(req);
    const g = guild(guildId, res);
    if (!g) return;
    const roles = [...g.roles.cache.values()]
      .filter((r) => (r as { id: string }).id !== g.id) // drop @everyone
      .map((r) => {
        const role = r as { id: string; name: string; color: number; position: number; managed?: boolean };
        return {
          id: role.id,
          name: role.name,
          color: hexColor(role.color),
          position: role.position,
          managed: Boolean(role.managed),
        };
      })
      .sort((a, b) => b.position - a.position);
    res.json({ roles });
  });

  return router;
}
