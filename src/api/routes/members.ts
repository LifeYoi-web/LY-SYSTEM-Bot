import { Router } from 'express';
import type { Client } from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../../shared/config';
import { clamp } from '../../shared/analytics';

export interface MembersDeps {
  client: Client;
  prisma: PrismaClient;
  config: Pick<AppConfig, 'guildId'>;
}

function hexColor(c?: number | null): string | null {
  if (!c) return null;
  return '#' + c.toString(16).padStart(6, '0');
}

interface RoleLike {
  id: string;
  name: string;
  color: number;
  position: number;
}

// Mapped over both discord.js GuildMembers (real) and the lightweight fakes used
// in tests, so every field access is defensive.
function mapMember(m: any, guildId: string) {
  const roles: RoleLike[] = [...(m.roles?.cache?.values?.() ?? [])]
    .filter((r: RoleLike) => r.id !== guildId)
    .sort((a: RoleLike, b: RoleLike) => b.position - a.position);
  const colored = roles.find((r) => r.color);
  return {
    id: m.id,
    username: m.user?.username ?? m.id,
    globalName: m.user?.globalName ?? null,
    displayName: m.displayName ?? m.user?.username ?? m.id,
    avatarUrl: m.user?.displayAvatarURL?.() ?? null,
    isBot: Boolean(m.user?.bot),
    joinedAt: m.joinedTimestamp ? new Date(m.joinedTimestamp).toISOString() : null,
    createdAt: m.user?.createdTimestamp ? new Date(m.user.createdTimestamp).toISOString() : null,
    color: hexColor(colored?.color ?? 0),
    roleCount: roles.length,
    roles: roles.slice(0, 6).map((r) => ({ id: r.id, name: r.name, color: hexColor(r.color) })),
  };
}

export function createMembersRouter(deps: MembersDeps): Router {
  const router = Router();
  const { client, prisma, config } = deps;

  router.get('/', (req, res) => {
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) {
      res.status(503).json({ error: 'guild not available' });
      return;
    }
    const search = String(req.query.search ?? '').toLowerCase().trim();
    const filter = String(req.query.filter ?? 'all');
    const sort = String(req.query.sort ?? 'joined');
    const limit = clamp(Number(req.query.limit ?? 50), 1, 100);
    const offset = Math.max(Math.trunc(Number(req.query.offset ?? 0)) || 0, 0);

    let list = [...guild.members.cache.values()];
    if (filter === 'humans') list = list.filter((m) => !m.user.bot);
    else if (filter === 'bots') list = list.filter((m) => m.user.bot);
    if (search) {
      list = list.filter(
        (m) =>
          m.user.username.toLowerCase().includes(search) ||
          (m.displayName ?? '').toLowerCase().includes(search) ||
          m.id.includes(search),
      );
    }
    if (sort === 'name') {
      list.sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? ''));
    } else {
      list.sort((a, b) => (b.joinedTimestamp ?? 0) - (a.joinedTimestamp ?? 0));
    }

    const total = list.length;
    const members = list.slice(offset, offset + limit).map((m) => mapMember(m, guild.id));
    res.json({ members, total, limit, offset });
  });

  router.get('/:id', async (req, res) => {
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) {
      res.status(503).json({ error: 'guild not available' });
      return;
    }
    const id = req.params.id;
    const member = guild.members.cache.get(id) ?? (await guild.members.fetch(id).catch(() => null));
    if (!member) {
      res.status(404).json({ error: 'member not found' });
      return;
    }
    const cases = await prisma.moderationCase.findMany({
      where: { guildId: config.guildId, targetUserId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const byType: Record<string, number> = {};
    for (const c of cases) byType[c.type] = (byType[c.type] ?? 0) + 1;
    res.json({
      member: mapMember(member, guild.id),
      cases,
      stats: { total: cases.length, active: cases.filter((c) => c.active).length, byType },
    });
  });

  return router;
}
