import { Router } from 'express';
import type { Client, TextChannel } from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../../shared/config';
import {
  getTicketConfig,
  updateTicketConfig,
  getTicketTypes,
  invalidateTicketTypes,
} from '../../db/community';
import { buildTicketPanel, closeTicket, reopenTicket } from '../../bot/tickets';
import { optStr } from '../util';
import { planLimit } from '../middleware/entitlements';
import { tenantGuildId } from '../middleware/tenant';

export interface TicketsDeps {
  client: Client;
  prisma: PrismaClient;
  config: Pick<AppConfig, 'guildId'>;
}

const MAX_MSG = 1000;

export function createTicketsRouter(deps: TicketsDeps): Router {
  const router = Router();
  const { client, prisma } = deps;

  router.get('/', async (req, res) => {
    const guildId = tenantGuildId(req);
    const [cfg, types, open, closed, transcripts] = await Promise.all([
      getTicketConfig(guildId),
      getTicketTypes(guildId),
      prisma.ticket.findMany({ where: { guildId, status: 'open' }, orderBy: { createdAt: 'desc' } }),
      prisma.ticket.findMany({ where: { guildId, status: 'closed' }, orderBy: { closedAt: 'desc' }, take: 50 }),
      prisma.ticketTranscript.findMany({
        where: { guildId },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: { id: true, ticketId: true },
      }),
    ]);
    // Latest transcript per ticket (list is newest-first).
    const tmap = new Map<string, string>();
    for (const tr of transcripts) if (!tmap.has(tr.ticketId)) tmap.set(tr.ticketId, tr.id);
    const closedWithTranscript = closed.map((c) => ({ ...c, transcriptId: tmap.get(c.id) ?? null }));
    res.json({ config: cfg, types, tickets: open, closed: closedWithTranscript });
  });

  router.put('/config', async (req, res) => {
    const guildId = tenantGuildId(req);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (b.enabled !== undefined) data.enabled = Boolean(b.enabled);
    if (b.categoryId !== undefined) data.categoryId = optStr(b.categoryId);
    if (b.supportRoleId !== undefined) data.supportRoleId = optStr(b.supportRoleId);
    if (b.transcriptChannelId !== undefined) data.transcriptChannelId = optStr(b.transcriptChannelId);
    if (b.dmOnOpen !== undefined) data.dmOnOpen = Boolean(b.dmOnOpen);
    if (b.dmOnClose !== undefined) data.dmOnClose = Boolean(b.dmOnClose);
    if (b.openMessage !== undefined) {
      const s = optStr(b.openMessage);
      if (s && s.length > MAX_MSG) return res.status(400).json({ error: 'openMessage too long' });
      data.openMessage = s;
    }
    res.json(await updateTicketConfig(guildId, data));
  });

  // ---- ticket types ----
  router.post('/types', async (req, res) => {
    const guildId = tenantGuildId(req);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const label = optStr(b.label);
    if (!label) return res.status(400).json({ error: 'label required' });
    if (label.length > 80) return res.status(400).json({ error: 'label too long' });
    const openMessage = b.openMessage !== undefined ? optStr(b.openMessage) : null;
    if (openMessage && openMessage.length > MAX_MSG) return res.status(400).json({ error: 'openMessage too long' });
    const limit = await planLimit(guildId, 'ticketTypes');
    if ((await prisma.ticketType.count({ where: { guildId } })) >= limit) {
      return res.status(403).json({ error: 'limit reached', upgrade: true, limit });
    }
    const created = await prisma.ticketType.create({
      data: {
        guildId,
        label,
        emoji: optStr(b.emoji),
        categoryId: optStr(b.categoryId),
        supportRoleId: optStr(b.supportRoleId),
        openMessage,
        pingSupport: b.pingSupport !== undefined ? Boolean(b.pingSupport) : true,
        position: Number.isFinite(Number(b.position)) ? Number(b.position) : 0,
        enabled: b.enabled !== undefined ? Boolean(b.enabled) : true,
      },
    });
    invalidateTicketTypes(guildId);
    res.status(201).json(created);
  });

  router.put('/types/:id', async (req, res) => {
    const guildId = tenantGuildId(req);
    const existing = await prisma.ticketType.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.guildId !== guildId) return res.status(404).json({ error: 'type not found' });
    const b = (req.body ?? {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (b.label !== undefined) {
      const l = optStr(b.label);
      if (!l) return res.status(400).json({ error: 'label required' });
      if (l.length > 80) return res.status(400).json({ error: 'label too long' });
      data.label = l;
    }
    if (b.emoji !== undefined) data.emoji = optStr(b.emoji);
    if (b.categoryId !== undefined) data.categoryId = optStr(b.categoryId);
    if (b.supportRoleId !== undefined) data.supportRoleId = optStr(b.supportRoleId);
    if (b.openMessage !== undefined) {
      const s = optStr(b.openMessage);
      if (s && s.length > MAX_MSG) return res.status(400).json({ error: 'openMessage too long' });
      data.openMessage = s;
    }
    if (b.pingSupport !== undefined) data.pingSupport = Boolean(b.pingSupport);
    if (b.position !== undefined) data.position = Number(b.position) || 0;
    if (b.enabled !== undefined) data.enabled = Boolean(b.enabled);
    const updated = await prisma.ticketType
      .update({ where: { id: existing.id }, data })
      .catch(() => null);
    if (!updated) return res.status(404).json({ error: 'type not found' });
    invalidateTicketTypes(guildId);
    res.json(updated);
  });

  router.delete('/types/:id', async (req, res) => {
    const guildId = tenantGuildId(req);
    const { count } = await prisma.ticketType.deleteMany({ where: { id: req.params.id, guildId } });
    if (count === 0) return res.status(404).json({ error: 'not found' });
    invalidateTicketTypes(guildId);
    res.json({ ok: true });
  });

  // ---- panel ----
  router.post('/panel', async (req, res) => {
    const guildId = tenantGuildId(req);
    const channelId = String((req.body ?? {}).channelId ?? '');
    if (!channelId) return res.status(400).json({ error: 'channelId required' });
    const [cfg, types] = await Promise.all([getTicketConfig(guildId), getTicketTypes(guildId)]);
    const channel = client.channels.cache.get(channelId) as TextChannel | undefined;
    if (!channel?.isTextBased?.()) return res.status(400).json({ error: 'invalid channel' });
    try {
      await channel.send(buildTicketPanel(cfg, types));
      res.json({ ok: true });
    } catch {
      res.status(502).json({ error: 'could not post panel — check bot permissions' });
    }
  });

  // ---- live ticket actions ----
  router.post('/:id/close', async (req, res) => {
    const guildId = tenantGuildId(req);
    const ticket = await prisma.ticket.findFirst({ where: { id: req.params.id, guildId, status: 'open' } });
    if (!ticket) return res.status(404).json({ error: 'open ticket not found' });
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(503).json({ error: 'guild not available' });
    const staffId = req.session?.user?.id ?? 'dashboard';
    const ok = await closeTicket(guild, prisma, ticket.channelId, staffId, optStr((req.body ?? {}).reason) ?? undefined);
    res.json({ ok });
  });

  router.post('/:id/reopen', async (req, res) => {
    const guildId = tenantGuildId(req);
    const ticket = await prisma.ticket.findFirst({ where: { id: req.params.id, guildId } });
    if (!ticket) return res.status(404).json({ error: 'ticket not found' });
    if (ticket.status === 'open') return res.status(400).json({ error: 'ticket already open' });
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(503).json({ error: 'guild not available' });
    const staffId = req.session?.user?.id ?? 'dashboard';
    const channel = await reopenTicket(guild, prisma, ticket.id, staffId);
    if (!channel) return res.status(502).json({ error: 'could not reopen' });
    res.json({ ok: true, channelId: channel.id });
  });

  // ---- transcript viewer (served as HTML, opened in a new tab) ----
  router.get('/transcripts/:id', async (req, res) => {
    const guildId = tenantGuildId(req);
    const t = await prisma.ticketTranscript.findFirst({ where: { id: req.params.id, guildId } });
    if (!t) return res.status(404).send('transcript not found');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(t.html);
  });

  return router;
}
