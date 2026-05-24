import { Router } from 'express';
import { EmbedBuilder, type Client, type TextChannel } from 'discord.js';
import type { AppConfig } from '../../shared/config';

export interface AnnounceDeps {
  client: Client;
  config: Pick<AppConfig, 'guildId'>;
}

interface EmbedInput {
  title?: string;
  description?: string;
  color?: string;
  imageUrl?: string;
  footer?: string;
}

export function createAnnounceRouter(deps: AnnounceDeps): Router {
  const router = Router();
  const { client } = deps;

  router.post('/', async (req, res) => {
    const b = (req.body ?? {}) as { channelId?: unknown; content?: unknown; embed?: EmbedInput };
    const channelId = String(b.channelId ?? '');
    const content = b.content ? String(b.content).slice(0, 2000) : '';
    const e = b.embed;
    const hasEmbed = e && (e.title || e.description || e.imageUrl);
    if (!channelId) return res.status(400).json({ error: 'channelId required' });
    if (!content && !hasEmbed) return res.status(400).json({ error: 'content or embed required' });

    const channel = client.channels.cache.get(channelId) as TextChannel | undefined;
    if (!channel?.isTextBased?.()) return res.status(400).json({ error: 'invalid channel' });

    const payload: Record<string, unknown> = { allowedMentions: { parse: ['users', 'roles'] } };
    if (content) payload.content = content;
    if (hasEmbed) {
      const embed = new EmbedBuilder();
      if (e!.title) embed.setTitle(String(e!.title).slice(0, 256));
      if (e!.description) embed.setDescription(String(e!.description).slice(0, 4000));
      embed.setColor(/^#[0-9a-fA-F]{6}$/.test(e!.color ?? '') ? (e!.color as `#${string}`) : 0xf57c00);
      if (e!.imageUrl && /^https?:\/\//.test(e!.imageUrl)) embed.setImage(e!.imageUrl);
      if (e!.footer) embed.setFooter({ text: String(e!.footer).slice(0, 2048) });
      embed.setTimestamp();
      payload.embeds = [embed];
    }

    try {
      const msg = await channel.send(payload);
      res.status(201).json({ ok: true, messageId: msg.id });
    } catch {
      res.status(502).json({ error: 'could not send — check bot permissions in that channel' });
    }
  });

  return router;
}
