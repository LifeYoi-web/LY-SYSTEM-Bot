import { Router } from 'express';
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Client,
  type TextChannel,
} from 'discord.js';
import type { PrismaClient, Prisma } from '@prisma/client';
import type { AppConfig } from '../../shared/config';
import { planLimit } from '../middleware/entitlements';

export interface RolePanelsDeps {
  client: Client;
  prisma: PrismaClient;
  config: Pick<AppConfig, 'guildId'>;
}

interface PanelRole {
  roleId: string;
  label: string;
  emoji?: string;
  style?: number;
}

function validateRoles(input: unknown): PanelRole[] | null {
  if (!Array.isArray(input)) return null;
  const out: PanelRole[] = [];
  for (const raw of input.slice(0, 25)) {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const roleId = String(r.roleId ?? '');
    const label = String(r.label ?? '').slice(0, 80);
    if (!roleId || !label) return null;
    const style = Number(r.style);
    out.push({
      roleId,
      label,
      emoji: r.emoji ? String(r.emoji).slice(0, 32) : undefined,
      style: style >= 1 && style <= 4 ? style : 2,
    });
  }
  return out;
}

export function buildPanelMessage(panel: { title: string; description: string | null; roles: PanelRole[] }) {
  const embed = new EmbedBuilder().setColor(0xf57c00).setTitle(panel.title);
  if (panel.description) embed.setDescription(panel.description);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < panel.roles.length; i += 5) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const r of panel.roles.slice(i, i + 5)) {
      const btn = new ButtonBuilder().setCustomId(`rr:${r.roleId}`).setLabel(r.label).setStyle((r.style ?? 2) as ButtonStyle);
      // setEmoji throws on a malformed emoji string — never let one bad value block the whole panel.
      if (r.emoji) try { btn.setEmoji(r.emoji); } catch { /* ignore invalid emoji */ }
      row.addComponents(btn);
    }
    rows.push(row);
  }
  return { embeds: [embed], components: rows };
}

export function createRolePanelsRouter(deps: RolePanelsDeps): Router {
  const router = Router();
  const { client, prisma, config } = deps;
  const guildId = config.guildId;

  router.get('/', async (_req, res) => {
    const panels = await prisma.rolePanel.findMany({ where: { guildId }, orderBy: { createdAt: 'desc' } });
    res.json({ panels });
  });

  router.post('/', async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const title = String(b.title ?? '').trim().slice(0, 256);
    if (!title) return res.status(400).json({ error: 'title required' });
    const roles = validateRoles(b.roles ?? []);
    if (roles === null) return res.status(400).json({ error: 'invalid roles' });
    const limit = await planLimit(guildId, 'rolePanels');
    if ((await prisma.rolePanel.count({ where: { guildId } })) >= limit) {
      return res.status(403).json({ error: 'limit reached', upgrade: true, limit });
    }
    const panel = await prisma.rolePanel.create({
      data: {
        guildId,
        title,
        description: b.description ? String(b.description).slice(0, 2000) : null,
        roles: roles as unknown as Prisma.InputJsonValue,
      },
    });
    res.status(201).json(panel);
  });

  router.put('/:id', async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const data: Prisma.RolePanelUpdateInput = {};
    if (b.title !== undefined) data.title = String(b.title).trim().slice(0, 256);
    if (b.description !== undefined) data.description = b.description ? String(b.description).slice(0, 2000) : null;
    if (b.roles !== undefined) {
      const roles = validateRoles(b.roles);
      if (roles === null) return res.status(400).json({ error: 'invalid roles' });
      data.roles = roles as unknown as Prisma.InputJsonValue;
    }
    const panel = await prisma.rolePanel.update({ where: { id: req.params.id }, data });
    res.json(panel);
  });

  router.delete('/:id', async (req, res) => {
    await prisma.rolePanel.delete({ where: { id: req.params.id } }).catch(() => undefined);
    res.json({ ok: true });
  });

  router.post('/:id/post', async (req, res) => {
    const channelId = String((req.body ?? {}).channelId ?? '');
    if (!channelId) return res.status(400).json({ error: 'channelId required' });
    const panel = await prisma.rolePanel.findUnique({ where: { id: req.params.id } });
    if (!panel || panel.guildId !== guildId) return res.status(404).json({ error: 'panel not found' });
    const channel = client.channels.cache.get(channelId) as TextChannel | undefined;
    if (!channel?.isTextBased?.()) return res.status(400).json({ error: 'invalid channel' });
    try {
      const msg = await channel.send(
        buildPanelMessage({ title: panel.title, description: panel.description, roles: panel.roles as unknown as PanelRole[] }),
      );
      const updated = await prisma.rolePanel.update({
        where: { id: panel.id },
        data: { channelId, messageId: msg.id },
      });
      res.json(updated);
    } catch {
      res.status(502).json({ error: 'could not post panel — check bot permissions' });
    }
  });

  return router;
}
