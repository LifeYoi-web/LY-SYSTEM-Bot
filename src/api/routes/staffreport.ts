import { Router } from 'express';
import { PermissionFlagsBits, type Client } from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../../shared/config';
import { getSettings } from '../../db/settingsCache';

export interface StaffReportDeps {
  client: Client;
  prisma: PrismaClient;
  config: Pick<AppConfig, 'guildId'>;
}

interface Row {
  userId: string;
  tag: string | null;
  modActions: number;
  ticketsClaimed: number;
  ticketsClosed: number;
  inactive: boolean;
}

export function createStaffReportRouter(deps: StaffReportDeps): Router {
  const router = Router();
  const { client, prisma, config } = deps;
  const guildId = config.guildId;

  router.get('/', async (req, res) => {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const since = new Date(Date.now() - days * 86_400_000);

    const [modCases, claimed, closed] = await Promise.all([
      prisma.moderationCase.groupBy({ by: ['moderatorId'], where: { guildId, createdAt: { gte: since } }, _count: { _all: true } }),
      prisma.ticket.groupBy({ by: ['claimedBy'], where: { guildId, claimedBy: { not: null }, createdAt: { gte: since } }, _count: { _all: true } }),
      prisma.ticket.groupBy({ by: ['closedBy'], where: { guildId, closedBy: { not: null }, closedAt: { gte: since } }, _count: { _all: true } }),
    ]);

    const map = new Map<string, Row>();
    const ensure = (id: string): Row => {
      let r = map.get(id);
      if (!r) {
        r = { userId: id, tag: null, modActions: 0, ticketsClaimed: 0, ticketsClosed: 0, inactive: false };
        map.set(id, r);
      }
      return r;
    };
    for (const m of modCases) if (m.moderatorId) ensure(m.moderatorId).modActions += m._count._all;
    for (const c of claimed) if (c.claimedBy) ensure(c.claimedBy).ticketsClaimed += c._count._all;
    for (const c of closed) if (c.closedBy) ensure(c.closedBy).ticketsClosed += c._count._all;

    // Add every configured staff member (so inactive staff with zero actions still show).
    const settings = await getSettings(guildId).catch(() => null);
    const staffRoleIds = settings?.staffRoleIds ?? [];
    const guild = client.guilds.cache.get(guildId);
    if (guild) {
      for (const member of guild.members.cache.values()) {
        if (member.user.bot) continue;
        const isStaff = member.permissions.has(PermissionFlagsBits.ManageGuild) || staffRoleIds.some((r) => member.roles.cache.has(r));
        if (!isStaff) continue;
        ensure(member.id).tag = member.user.tag;
      }
    }

    const rows = [...map.values()].map((r) => ({
      ...r,
      inactive: r.tag !== null && r.modActions + r.ticketsClaimed + r.ticketsClosed === 0,
    }));
    rows.sort((a, b) => b.modActions + b.ticketsClaimed + b.ticketsClosed - (a.modActions + a.ticketsClaimed + a.ticketsClosed));
    res.json({ days, rows });
  });

  return router;
}
