import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Client,
  type TextChannel,
} from 'discord.js';
import type { CreatorAnnounceConfig } from '@prisma/client';
import type { ContentItem, Platform } from './types';

const ORANGE = 0xf57c00; // LY brand
const PLATFORM_LABEL: Record<Platform, string> = { youtube: 'YouTube', tiktok: 'TikTok' };
const DEFAULT_TEMPLATE = '🎬 نزل فيديو جديد! لا يفوتكم 🔥';

export function renderTemplate(
  tpl: string,
  ctx: { title: string; url: string; platform: string; creator: string },
): string {
  return tpl
    .split('{title}').join(ctx.title)
    .split('{url}').join(ctx.url)
    .split('{platform}').join(ctx.platform)
    .split('{creator}').join(ctx.creator);
}

/** Resolve the ping content + allowedMentions for the configured ping mode. */
export function pingFor(cfg: CreatorAnnounceConfig): {
  content: string;
  allowedMentions: Record<string, unknown>;
} {
  switch (cfg.pingMode) {
    case 'everyone':
      return { content: '@everyone', allowedMentions: { parse: ['everyone'] } };
    case 'here':
      return { content: '@here', allowedMentions: { parse: ['everyone'] } };
    case 'role':
      return cfg.pingRoleId
        ? { content: `<@&${cfg.pingRoleId}>`, allowedMentions: { roles: [cfg.pingRoleId] } }
        : { content: '', allowedMentions: { parse: [] } };
    default:
      return { content: '', allowedMentions: { parse: [] } };
  }
}

/** Build the message payload (ping in content, rich preview in the embed, link button). */
export function buildAnnouncement(cfg: CreatorAnnounceConfig, platform: Platform, item: ContentItem) {
  const label = PLATFORM_LABEL[platform];
  const creator =
    (platform === 'youtube' ? cfg.youtubeChannelId : cfg.tiktokUsername)?.trim() || '';
  const description = renderTemplate(cfg.messageTemplate?.trim() || DEFAULT_TEMPLATE, {
    title: item.title,
    url: item.url,
    platform: label,
    creator,
  });

  const embed = new EmbedBuilder()
    .setColor(ORANGE)
    .setAuthor({ name: creator ? `${label} · ${creator}` : label })
    .setTitle(item.title.slice(0, 256))
    .setURL(item.url)
    .setDescription(description.slice(0, 4000))
    .setFooter({ text: label })
    .setTimestamp(item.publishedAt ?? new Date());
  if (item.thumbnail) embed.setImage(item.thumbnail);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('▶️ شاهد الآن').setURL(item.url),
  );

  const { content, allowedMentions } = pingFor(cfg);
  return { content, embeds: [embed], components: [row], allowedMentions };
}

/** Post an announcement to the configured channel. Returns false when the channel is unusable. */
export async function announceContent(
  client: Client,
  cfg: CreatorAnnounceConfig,
  platform: Platform,
  item: ContentItem,
): Promise<boolean> {
  if (!cfg.channelId) return false;
  const channel = client.channels.cache.get(cfg.channelId) as TextChannel | undefined;
  if (!channel?.isTextBased?.()) return false;
  await channel.send(buildAnnouncement(cfg, platform, item) as never);
  return true;
}
