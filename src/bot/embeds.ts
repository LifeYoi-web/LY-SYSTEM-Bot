import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Client,
  type TextChannel,
  type MessageActionRowComponentBuilder,
} from 'discord.js';

export interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}
export interface EmbedLinkButton {
  label: string;
  url: string;
  emoji?: string;
}
export interface EmbedPayload {
  title?: string;
  description?: string;
  color?: string; // hex, e.g. "#f57c00"
  fields?: EmbedField[];
  image?: string;
  thumbnail?: string;
  footer?: string;
  author?: string;
  buttons?: EmbedLinkButton[];
}

const ORANGE = 0xf57c00;
function parseColor(hex?: string): number {
  if (!hex) return ORANGE;
  const n = parseInt(hex.replace('#', ''), 16);
  return Number.isNaN(n) ? ORANGE : n;
}

const ZW = '​';

export interface BuiltMessage {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[];
}

/** Render a stored embed payload into a sendable Discord message (embed + link buttons). */
export function buildEmbedFromPayload(p: EmbedPayload): BuiltMessage {
  const e = new EmbedBuilder().setColor(parseColor(p.color));
  if (p.title) e.setTitle(p.title.slice(0, 256));
  if (p.description) e.setDescription(p.description.slice(0, 4096));
  if (p.fields?.length) {
    e.addFields(
      p.fields.slice(0, 25).map((f) => ({
        name: (f.name || ZW).slice(0, 256),
        value: (f.value || ZW).slice(0, 1024),
        inline: Boolean(f.inline),
      })),
    );
  }
  if (p.image) e.setImage(p.image);
  if (p.thumbnail) e.setThumbnail(p.thumbnail);
  if (p.footer) e.setFooter({ text: p.footer.slice(0, 2048) });
  if (p.author) e.setAuthor({ name: p.author.slice(0, 256) });

  const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  const btns = (p.buttons ?? []).filter((b) => b.label && /^https?:\/\//i.test(b.url)).slice(0, 5);
  if (btns.length) {
    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>();
    for (const b of btns) {
      const btn = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(b.label.slice(0, 80)).setURL(b.url);
      if (b.emoji) {
        try {
          btn.setEmoji(b.emoji);
        } catch {
          /* invalid emoji — keep the button without it */
        }
      }
      row.addComponents(btn);
    }
    components.push(row);
  }
  return { embeds: [e], components };
}

/** True when the payload has enough to be a valid Discord embed. */
export function isValidEmbed(p: EmbedPayload): boolean {
  return Boolean(p.title || p.description || (p.fields && p.fields.length));
}

/** Post a new embed (or edit a previously posted one). Returns the resulting message id. */
export async function postOrEditEmbed(
  client: Client,
  channelId: string,
  messageId: string | null,
  payload: EmbedPayload,
): Promise<string | null> {
  const channel = client.channels.cache.get(channelId) as TextChannel | undefined;
  if (!channel?.isTextBased?.()) return null;
  const built = buildEmbedFromPayload(payload);
  if (messageId) {
    const msg = await channel.messages.fetch(messageId).catch(() => null);
    if (msg) {
      await msg.edit(built).catch(() => undefined);
      return messageId;
    }
  }
  const sent = await channel.send(built).catch(() => null);
  return sent?.id ?? null;
}
