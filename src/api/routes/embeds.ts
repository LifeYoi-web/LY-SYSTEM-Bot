import { Router } from 'express';
import type { PrismaClient, Prisma } from '@prisma/client';
import type { Client } from 'discord.js';
import type { AppConfig } from '../../shared/config';
import { postOrEditEmbed, isValidEmbed, type EmbedPayload } from '../../bot/embeds';

export interface EmbedsDeps {
  client: Client;
  prisma: PrismaClient;
  config: Pick<AppConfig, 'guildId'>;
}

export function createEmbedsRouter(deps: EmbedsDeps): Router {
  const router = Router();
  const { client, prisma, config } = deps;
  const guildId = config.guildId;

  router.get('/', async (_req, res) => {
    const embeds = await prisma.savedEmbed.findMany({ where: { guildId }, orderBy: { updatedAt: 'desc' } });
    res.json({ embeds });
  });

  router.post('/', async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const name = String(b.name ?? '').trim();
    if (!name || name.length > 80) return res.status(400).json({ error: 'name required (≤80 chars)' });
    const payload = (b.payload ?? {}) as EmbedPayload;
    if (!isValidEmbed(payload)) return res.status(400).json({ error: 'embed needs a title, description, or fields' });
    const created = await prisma.savedEmbed
      .create({ data: { guildId, name, payload: payload as Prisma.InputJsonValue } })
      .catch(() => null);
    if (!created) return res.status(409).json({ error: 'an embed with this name already exists' });
    res.status(201).json(created);
  });

  router.put('/:id', async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (b.name !== undefined) {
      const name = String(b.name).trim();
      if (!name || name.length > 80) return res.status(400).json({ error: 'name required (≤80 chars)' });
      data.name = name;
    }
    if (b.payload !== undefined) {
      if (!isValidEmbed(b.payload as EmbedPayload)) return res.status(400).json({ error: 'embed needs a title, description, or fields' });
      data.payload = b.payload as Prisma.InputJsonValue;
    }
    const updated = await prisma.savedEmbed.update({ where: { id: req.params.id }, data }).catch(() => null);
    if (!updated) return res.status(404).json({ error: 'not found' });
    res.json(updated);
  });

  router.delete('/:id', async (req, res) => {
    await prisma.savedEmbed.delete({ where: { id: req.params.id } }).catch(() => undefined);
    res.json({ ok: true });
  });

  // Post (or re-edit) a saved embed to a channel.
  router.post('/:id/post', async (req, res) => {
    const channelId = String((req.body as Record<string, unknown>)?.channelId ?? '').trim();
    const embed = await prisma.savedEmbed.findUnique({ where: { id: req.params.id } });
    if (!embed || embed.guildId !== guildId) return res.status(404).json({ error: 'not found' });
    const target = channelId || embed.postedChannelId;
    if (!target) return res.status(400).json({ error: 'channelId required' });
    // Re-edit the existing message only when posting to the same channel.
    const reuseId = target === embed.postedChannelId ? embed.postedMessageId : null;
    const messageId = await postOrEditEmbed(client, target, reuseId, embed.payload as EmbedPayload);
    if (!messageId) return res.status(400).json({ error: 'could not post to that channel' });
    const saved = await prisma.savedEmbed.update({
      where: { id: embed.id },
      data: { postedChannelId: target, postedMessageId: messageId },
    });
    res.json(saved);
  });

  return router;
}
