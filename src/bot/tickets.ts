import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType,
  PermissionFlagsBits,
  type Client,
  type Guild,
  type GuildMember,
  type TextChannel,
  type OverwriteResolvable,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import type { PrismaClient, Ticket, TicketConfig, TicketType } from '@prisma/client';
import { getTicketConfig, getTicketTypes, invalidateTicketConfig } from '../db/community';
import { getSettings } from '../db/settingsCache';
import { logEvent } from './logging';
import { summarizeTranscript } from '../shared/ai';
import { featureAllowed } from './premium';

const ORANGE = 0xf57c00;

/* ============================ pure helpers ============================ */

/** A ticket type resolved for use — either a configured TicketType or the config-derived default. */
export interface ResolvedTicketType {
  id: string | null; // null = the default type derived from TicketConfig
  label: string;
  slug: string; // channel-name prefix
  emoji: string | null;
  categoryId: string | null;
  supportRoleId: string | null;
  openMessage: string | null;
  pingSupport: boolean;
}

/** Build a Discord-safe channel-name prefix from a human label. */
export function slugifyTicketName(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90);
  return slug || 'ticket';
}

function defaultType(cfg: TicketConfig): ResolvedTicketType {
  return {
    id: null,
    label: 'تذكرة',
    slug: 'ticket',
    emoji: '🎫',
    categoryId: cfg.categoryId,
    supportRoleId: cfg.supportRoleId,
    openMessage: cfg.openMessage,
    pingSupport: true,
  };
}

function mapType(t: TicketType): ResolvedTicketType {
  return {
    id: t.id,
    label: t.label,
    slug: slugifyTicketName(t.label),
    emoji: t.emoji,
    categoryId: t.categoryId,
    supportRoleId: t.supportRoleId,
    openMessage: t.openMessage,
    pingSupport: t.pingSupport,
  };
}

/** Pick the type to open as: the requested type if it exists, otherwise the config default. */
export function resolveType(cfg: TicketConfig, types: TicketType[], typeId?: string | null): ResolvedTicketType {
  if (typeId) {
    const t = types.find((x) => x.id === typeId);
    if (t) return mapType(t);
  }
  return defaultType(cfg);
}

/** Staff = Administrator/ManageGuild, or a member of any configured support role (default + per-type). */
export function isTicketStaff(member: GuildMember, cfg: TicketConfig, types: TicketType[]): boolean {
  if (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild)
  ) {
    return true;
  }
  const roleIds = new Set<string>();
  if (cfg.supportRoleId) roleIds.add(cfg.supportRoleId);
  for (const t of types) if (t.supportRoleId) roleIds.add(t.supportRoleId);
  for (const r of roleIds) if (member.roles.cache.has(r)) return true;
  return false;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface TranscriptMessage {
  authorTag: string;
  authorId: string;
  bot: boolean;
  content: string;
  createdAt: Date | string;
  attachments: string[];
}
export interface TranscriptData {
  guildName: string;
  number: number;
  typeLabel: string;
  opener: string;
  closedBy?: string | null;
  messages: TranscriptMessage[];
}

/** Render a self-contained, branded HTML transcript. Pure — safe to unit test. */
export function renderTranscriptHtml(d: TranscriptData): string {
  const rows = d.messages
    .map((m) => {
      const time = new Date(m.createdAt).toISOString().replace('T', ' ').slice(0, 19);
      const body = esc(m.content).replace(/\n/g, '<br>');
      const atts = m.attachments
        .map((u) => `<a href="${esc(u)}" target="_blank" rel="noreferrer">${esc(u)}</a>`)
        .join('<br>');
      return `<div class="msg"><div class="meta"><span class="author">${esc(m.authorTag)}${m.bot ? ' <span class="bot">BOT</span>' : ''}</span><span class="time">${time}</span></div><div class="body">${body || '<span class="empty">—</span>'}${atts ? `<div class="atts">${atts}</div>` : ''}</div></div>`;
    })
    .join('\n');
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>تذكرة #${d.number} — ${esc(d.guildName)}</title>
<style>
:root{--bg:#0f1115;--card:#181b21;--line:#272b33;--text:#e6e8eb;--muted:#9aa0aa;--accent:#f57c00}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:"Segoe UI",Tahoma,system-ui,sans-serif;line-height:1.6}
header{padding:20px 24px;border-bottom:2px solid var(--accent);background:var(--card)}
header h1{margin:0 0 6px;font-size:18px}header .sub{color:var(--muted);font-size:13px}
main{max-width:900px;margin:0 auto;padding:20px}
.msg{padding:10px 14px;border:1px solid var(--line);border-radius:10px;margin-bottom:10px;background:var(--card)}
.meta{display:flex;justify-content:space-between;gap:12px;margin-bottom:4px}
.author{font-weight:600;color:var(--accent)}.bot{font-size:10px;background:var(--accent);color:#000;border-radius:4px;padding:1px 4px;vertical-align:middle}
.time{color:var(--muted);font-size:12px;direction:ltr}
.body{white-space:normal;word-break:break-word}.empty{color:var(--muted)}
.atts{margin-top:6px;font-size:13px}.atts a{color:#5b9dff;direction:ltr;display:inline-block}
</style></head>
<body>
<header><h1>🎫 تذكرة #${d.number} — ${esc(d.typeLabel)}</h1>
<div class="sub">${esc(d.guildName)} · فتحها &lt;@${esc(d.opener)}&gt;${d.closedBy ? ` · أغلقها &lt;@${esc(d.closedBy)}&gt;` : ''} · ${d.messages.length} رسالة</div></header>
<main>${rows || '<p class="empty">لا توجد رسائل في هذه التذكرة.</p>'}</main>
</body></html>`;
}

/* ============================ component builders ============================ */

/** The control row posted inside a ticket: claim/unclaim toggle + close. */
export function ticketControlsRow(claimed: boolean): ActionRowBuilder<ButtonBuilder> {
  const claimBtn = claimed
    ? new ButtonBuilder().setCustomId('ticket:unclaim').setLabel('فك الاستلام').setEmoji('🙋').setStyle(ButtonStyle.Secondary)
    : new ButtonBuilder().setCustomId('ticket:claim').setLabel('استلام').setEmoji('🙋').setStyle(ButtonStyle.Success);
  const closeBtn = new ButtonBuilder().setCustomId('ticket:close').setLabel('إغلاق').setEmoji('🔒').setStyle(ButtonStyle.Danger);
  return new ActionRowBuilder<ButtonBuilder>().addComponents(claimBtn, closeBtn);
}

/** Ephemeral confirm row shown before a destructive close. */
export function closeConfirmRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('ticket:close:confirm').setLabel('تأكيد الإغلاق').setEmoji('🔒').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ticket:close:cancel').setLabel('إلغاء').setStyle(ButtonStyle.Secondary),
  );
}

function reopenRow(ticketId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`ticket:reopen:${ticketId}`).setLabel('إعادة فتح').setEmoji('🔓').setStyle(ButtonStyle.Success),
  );
}

/** Build the public ticket-opening panel: a type dropdown when types exist, else a single button. */
export function buildTicketPanel(cfg: TicketConfig, types: TicketType[]) {
  const enabled = types.filter((t) => t.enabled);
  const embed = new EmbedBuilder()
    .setColor(ORANGE)
    .setTitle('🎫 الدعم الفني')
    .setDescription(cfg.openMessage || 'هل تحتاج مساعدة؟ اختر نوع التذكرة لفتح محادثة خاصة مع فريق الدعم.');
  if (enabled.length === 0) {
    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId('ticket:open').setLabel('افتح تذكرة').setEmoji('🎫').setStyle(ButtonStyle.Primary),
    );
    return { embeds: [embed], components: [row] };
  }
  const menu = new StringSelectMenuBuilder().setCustomId('ticket:type').setPlaceholder('اختر نوع التذكرة');
  for (const t of enabled.slice(0, 25)) {
    const opt: { label: string; value: string; description?: string; emoji?: string } = {
      label: t.label.slice(0, 100),
      value: t.id,
    };
    if (t.openMessage) opt.description = t.openMessage.slice(0, 100);
    if (t.emoji && !t.emoji.includes('<')) opt.emoji = t.emoji; // unicode emoji only
    menu.addOptions(opt);
  }
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(menu);
  return { embeds: [embed], components: [row] };
}

function introMessage(t: ResolvedTicketType, userId: string, number: number, reopened: boolean) {
  const embed = new EmbedBuilder()
    .setColor(ORANGE)
    .setTitle(`${t.emoji ? `${t.emoji} ` : ''}تذكرة #${number} — ${t.label}`)
    .setDescription(
      (reopened ? '🔓 تم إعادة فتح التذكرة.\n' : '') +
        (t.openMessage || `أهلًا <@${userId}>! اشرح مشكلتك وفريق الدعم بيكون معك قريبًا.`),
    );
  const pingRole = t.pingSupport && t.supportRoleId ? t.supportRoleId : null;
  return {
    content: `<@${userId}>${pingRole ? ` <@&${pingRole}>` : ''}`,
    embeds: [embed],
    components: [ticketControlsRow(false)],
    allowedMentions: { users: [userId], roles: pingRole ? [pingRole] : [] },
  };
}

/* ============================ side-effecting actions ============================ */

function buildOverwrites(guild: Guild, userId: string, supportRoleId: string | null): OverwriteResolvable[] {
  const ow: OverwriteResolvable[] = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: userId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    },
  ];
  if (supportRoleId) {
    ow.push({
      id: supportRoleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    });
  }
  return ow;
}

/** Best-effort DM. Never throws. */
async function dmUser(client: Client, userId: string, content: string): Promise<void> {
  try {
    const user = await client.users.fetch(userId);
    await user.send({ content });
  } catch {
    /* user has DMs closed — best effort */
  }
}

/** Pull up to `cap` messages (oldest first) for the transcript. */
async function collectMessages(channel: TextChannel, cap = 500): Promise<TranscriptMessage[]> {
  const out: TranscriptMessage[] = [];
  let before: string | undefined;
  while (out.length < cap) {
    const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch || batch.size === 0) break;
    const arr = [...batch.values()];
    for (const m of arr) {
      out.push({
        authorTag: m.author?.tag ?? 'Unknown',
        authorId: m.author?.id ?? '',
        bot: m.author?.bot ?? false,
        content: m.content ?? '',
        createdAt: m.createdAt,
        attachments: [...m.attachments.values()].map((a) => a.url),
      });
    }
    before = arr[arr.length - 1]?.id;
    if (batch.size < 100) break;
  }
  return out.reverse();
}

/** Create a private ticket channel for the user. Returns the channel, or null if disabled/failed. */
export async function openTicket(
  guild: Guild,
  prisma: PrismaClient,
  userId: string,
  typeId?: string | null,
): Promise<TextChannel | null> {
  const cfg = await getTicketConfig(guild.id);
  if (!cfg.enabled) return null;

  // One open ticket per user. Re-use the existing channel, or clear a stale record if its
  // channel was deleted manually so the user isn't permanently blocked.
  const existing = await prisma.ticket.findFirst({ where: { guildId: guild.id, userId, status: 'open' } });
  if (existing) {
    const ch = guild.channels.cache.get(existing.channelId) as TextChannel | undefined;
    if (ch) return ch;
    await prisma.ticket
      .update({ where: { id: existing.id }, data: { status: 'closed', closedAt: new Date() } })
      .catch(() => undefined);
  }

  const types = await getTicketTypes(guild.id);
  const t = resolveType(cfg, types, typeId ?? undefined);

  const updated = await prisma.ticketConfig.update({ where: { guildId: guild.id }, data: { counter: { increment: 1 } } });
  const number = updated.counter;
  invalidateTicketConfig(guild.id);

  const channel = (await guild.channels
    .create({
      name: `${t.slug}-${number}`,
      type: ChannelType.GuildText,
      parent: t.categoryId ?? undefined,
      permissionOverwrites: buildOverwrites(guild, userId, t.supportRoleId),
    })
    .catch(() => null)) as TextChannel | null;
  if (!channel) {
    await prisma.ticketConfig
      .update({ where: { guildId: guild.id }, data: { counter: { decrement: 1 } } })
      .catch(() => undefined);
    invalidateTicketConfig(guild.id);
    return null;
  }

  await prisma.ticket.create({ data: { guildId: guild.id, channelId: channel.id, userId, number, typeId: t.id } });
  await channel.send(introMessage(t, userId, number, false)).catch(() => undefined);
  if (cfg.dmOnOpen) {
    await dmUser(guild.client, userId, `🎫 تم فتح تذكرتك **#${number}** في **${guild.name}**. فريق الدعم بيكون معك قريبًا.`);
  }
  await logEvent({ client: guild.client, prisma }, guild.id, 'ticket_open', {
    number,
    userId,
    typeId: t.id,
    typeLabel: t.label,
  });
  return channel;
}

/** Claim or release a ticket. Returns the updated ticket, or null if the channel isn't an open ticket. */
export async function setClaim(
  guild: Guild,
  prisma: PrismaClient,
  channelId: string,
  staffId: string,
  claim: boolean,
): Promise<Ticket | null> {
  const ticket = await prisma.ticket.findFirst({ where: { guildId: guild.id, channelId, status: 'open' } });
  if (!ticket) return null;
  const updated = await prisma.ticket.update({
    where: { id: ticket.id },
    data: { claimedBy: claim ? staffId : null },
  });
  await logEvent({ client: guild.client, prisma }, guild.id, claim ? 'ticket_claim' : 'ticket_unclaim', {
    number: ticket.number,
    staffId,
  });
  return updated;
}

export async function addUserToTicket(channel: TextChannel, userId: string): Promise<void> {
  await channel.permissionOverwrites.edit(userId, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
  });
}

export async function removeUserFromTicket(channel: TextChannel, userId: string): Promise<void> {
  await channel.permissionOverwrites.delete(userId).catch(() => undefined);
}

export async function renameTicket(channel: TextChannel, name: string): Promise<void> {
  await channel.setName(name.slice(0, 95));
}

/**
 * Close a ticket: render + store the transcript, post it to the transcript/log channel and DM the
 * opener, then delete the channel. Returns false if the channel isn't an open ticket.
 */
export async function closeTicket(
  guild: Guild,
  prisma: PrismaClient,
  channelId: string,
  closedBy: string,
  reason?: string,
): Promise<boolean> {
  const ticket = await prisma.ticket.findFirst({ where: { guildId: guild.id, channelId, status: 'open' } });
  if (!ticket) return false;

  const cfg = await getTicketConfig(guild.id);
  const types = await getTicketTypes(guild.id);
  const t = resolveType(cfg, types, ticket.typeId ?? undefined);
  const channel = guild.channels.cache.get(channelId) as TextChannel | undefined;

  const messages = channel ? await collectMessages(channel) : [];
  const html = renderTranscriptHtml({
    guildName: guild.name,
    number: ticket.number,
    typeLabel: t.label,
    opener: ticket.userId,
    closedBy,
    messages,
  });
  const saved = await prisma.ticketTranscript
    .create({ data: { guildId: guild.id, ticketId: ticket.id, number: ticket.number, html, closedBy } })
    .catch(() => null);

  // AI summary — fire-and-forget, gated on ANTHROPIC_API_KEY + aiSummaries plan feature.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey && saved && messages.length && (await featureAllowed(guild.id, 'aiSummaries'))) {
    const plain = messages.map((m) => `${m.authorTag}: ${m.content}`).join('\n');
    void summarizeTranscript(plain, apiKey).then((summary) => {
      if (summary) {
        return prisma.ticketTranscript.update({ where: { id: saved.id }, data: { aiSummary: summary } }).catch(() => undefined);
      }
    });
  }

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { status: 'closed', closedAt: new Date(), closedBy },
  });

  const destId = cfg.transcriptChannelId ?? (await getSettings(guild.id).catch(() => null))?.logChannelId ?? null;
  if (destId) {
    const dest = guild.channels.cache.get(destId) as TextChannel | undefined;
    if (dest?.isTextBased?.()) {
      const embed = new EmbedBuilder()
        .setColor(ORANGE)
        .setTitle(`📁 إغلاق تذكرة #${ticket.number} — ${t.label}`)
        .addFields(
          { name: 'العضو', value: `<@${ticket.userId}>`, inline: true },
          { name: 'أُغلقت بواسطة', value: `<@${closedBy}>`, inline: true },
          ...(reason ? [{ name: 'السبب', value: reason.slice(0, 1000) }] : []),
          { name: 'النسخة', value: 'محفوظة — اعرضها (مرسومة) من لوحة التحكم › التذاكر المغلقة.' },
        )
        .setTimestamp();
      // The transcript is stored and viewable (rendered) in the dashboard only — never posted as a
      // raw .html file, so the markup is not exposed to members or staff inside Discord.
      await dest
        .send({
          embeds: [embed],
          components: [reopenRow(ticket.id)],
          allowedMentions: { parse: [] },
        })
        .catch(() => undefined);
    }
  }

  if (cfg.dmOnClose) {
    await dmUser(guild.client, ticket.userId, `🔒 تم إغلاق تذكرتك **#${ticket.number}** في **${guild.name}**. شكرًا لتواصلك معنا.`);
  }

  await logEvent({ client: guild.client, prisma }, guild.id, 'ticket_close', {
    number: ticket.number,
    userId: ticket.userId,
    closedBy,
    reason: reason ?? null,
    transcriptId: saved?.id ?? null,
  });

  await channel?.delete('Ticket closed').catch(() => undefined);
  return true;
}

/** Re-open a previously closed ticket as a fresh channel, re-using the same record + number. */
export async function reopenTicket(
  guild: Guild,
  prisma: PrismaClient,
  ticketId: string,
  byUserId: string,
): Promise<TextChannel | null> {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket || ticket.guildId !== guild.id || ticket.status === 'open') return null;
  const cfg = await getTicketConfig(guild.id);
  if (!cfg.enabled) return null;
  const types = await getTicketTypes(guild.id);
  const t = resolveType(cfg, types, ticket.typeId ?? undefined);

  const channel = (await guild.channels
    .create({
      name: `${t.slug}-${ticket.number}`,
      type: ChannelType.GuildText,
      parent: t.categoryId ?? undefined,
      permissionOverwrites: buildOverwrites(guild, ticket.userId, t.supportRoleId),
    })
    .catch(() => null)) as TextChannel | null;
  if (!channel) return null;

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { status: 'open', channelId: channel.id, closedAt: null, closedBy: null, claimedBy: null },
  });
  await channel.send(introMessage(t, ticket.userId, ticket.number, true)).catch(() => undefined);
  if (cfg.dmOnOpen) {
    await dmUser(guild.client, ticket.userId, `🔓 تم إعادة فتح تذكرتك **#${ticket.number}** في **${guild.name}**.`);
  }
  await logEvent({ client: guild.client, prisma }, guild.id, 'ticket_reopen', { number: ticket.number, byUserId });
  return channel;
}
