import { Router } from 'express';
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Client,
  type TextChannel,
} from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../../shared/config';
import { getSettings, updateSettings } from '../../db/settingsCache';
import { optStr } from '../util';
import { tenantGuildId } from '../middleware/tenant';

export interface RulesDeps {
  client: Client;
  prisma: PrismaClient;
  config: Pick<AppConfig, 'guildId'>;
}

const MAX_MESSAGE = 2000;
const MAX_LABEL = 80;

/** Build the rules panel: rich embed + a single accept button bound to `rules:accept`. */
export function buildRulesPanel(message: string, buttonLabel?: string | null) {
  const embed = new EmbedBuilder()
    .setColor(0xf57c00)
    .setTitle('📜 قوانين السيرفر')
    .setDescription(message);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('rules:accept')
      .setLabel(buttonLabel || 'أوافق على القوانين')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
  );
  return { embeds: [embed], components: [row] };
}

function pickRules(s: { rulesEnabled: boolean; rulesChannelId: string | null; rulesMessage: string | null; rulesRoleId: string | null; rulesButtonLabel: string | null }) {
  return {
    rulesEnabled: s.rulesEnabled,
    rulesChannelId: s.rulesChannelId,
    rulesMessage: s.rulesMessage,
    rulesRoleId: s.rulesRoleId,
    rulesButtonLabel: s.rulesButtonLabel,
  };
}

export function createRulesRouter(deps: RulesDeps): Router {
  const router = Router();
  const { client } = deps;

  router.get('/', async (req, res) => {
    const guildId = tenantGuildId(req);
    res.json(pickRules(await getSettings(guildId)));
  });

  router.put('/', async (req, res) => {
    const guildId = tenantGuildId(req);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (b.rulesEnabled !== undefined) data.rulesEnabled = Boolean(b.rulesEnabled);
    if (b.rulesChannelId !== undefined) data.rulesChannelId = optStr(b.rulesChannelId);
    if (b.rulesRoleId !== undefined) data.rulesRoleId = optStr(b.rulesRoleId);
    if (b.rulesButtonLabel !== undefined) {
      const v = optStr(b.rulesButtonLabel);
      if (v && v.length > MAX_LABEL) return res.status(400).json({ error: 'rulesButtonLabel too long' });
      data.rulesButtonLabel = v;
    }
    if (b.rulesMessage !== undefined) {
      const v = optStr(b.rulesMessage);
      if (v && v.length > MAX_MESSAGE) return res.status(400).json({ error: `rulesMessage must be <= ${MAX_MESSAGE} chars` });
      data.rulesMessage = v;
    }
    const updated = await updateSettings(guildId, data);
    res.json(pickRules(updated));
  });

  router.post('/post', async (req, res) => {
    const guildId = tenantGuildId(req);
    const channelId = String((req.body ?? {}).channelId ?? '');
    if (!channelId) return res.status(400).json({ error: 'channelId required' });
    const s = await getSettings(guildId);
    if (!s.rulesMessage) return res.status(400).json({ error: 'rulesMessage not set' });
    if (!s.rulesRoleId) return res.status(400).json({ error: 'rulesRoleId not set' });
    const channel = client.channels.cache.get(channelId) as TextChannel | undefined;
    if (!channel?.isTextBased?.()) return res.status(400).json({ error: 'invalid channel' });
    try {
      await channel.send(buildRulesPanel(s.rulesMessage, s.rulesButtonLabel));
      res.json({ ok: true });
    } catch {
      res.status(502).json({ error: 'could not post panel — check bot permissions' });
    }
  });

  return router;
}
