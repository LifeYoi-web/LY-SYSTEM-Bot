import { Router } from 'express';
import type { Client } from 'discord.js';
import type { AppConfig } from '../../shared/config';

export interface MembersDeps {
  client: Client;
  config: Pick<AppConfig, 'guildId'>;
}

export function createMembersRouter(deps: MembersDeps): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const guild = deps.client.guilds.cache.get(deps.config.guildId);
    if (!guild) {
      res.status(503).json({ error: 'guild not available' });
      return;
    }
    const search = String(req.query.search ?? '').toLowerCase().trim();
    const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 100);

    let list = [...guild.members.cache.values()];
    if (search) {
      list = list.filter(
        (m) =>
          m.user.username.toLowerCase().includes(search) ||
          (m.displayName ?? '').toLowerCase().includes(search) ||
          m.id.includes(search),
      );
    }
    const members = list.slice(0, limit).map((m) => ({
      id: m.id,
      username: m.user.username,
      displayName: m.displayName,
      avatarUrl: m.user.displayAvatarURL?.() ?? null,
      isBot: m.user.bot,
    }));
    res.json({ members, total: list.length });
  });

  return router;
}
