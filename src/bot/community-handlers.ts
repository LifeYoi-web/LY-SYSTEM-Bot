import { EmbedBuilder, type Message, type TextChannel } from 'discord.js';
import { prisma } from '../db/prisma';
import {
  getAfk,
  clearAfk,
  getCounting,
  updateCounting,
  getHighlights,
  getStickyChannels,
} from '../db/community';
import { repostSticky } from './sticky';

/** Clear the author's AFK and notify if they mention an AFK member. */
export async function handleAfk(message: Message): Promise<void> {
  const guildId = message.guild!.id;
  const own = await getAfk(guildId, message.author.id);
  if (own) {
    await clearAfk(guildId, message.author.id);
    const m = await message.reply({ content: '👋 رجّعناك! شِلت حالة AFK.', allowedMentions: { repliedUser: false } }).catch(() => null);
    if (m) setTimeout(() => m.delete().catch(() => undefined), 5000);
  }
  for (const u of message.mentions.users.values()) {
    if (u.id === message.author.id) continue;
    const a = await getAfk(guildId, u.id);
    if (a) {
      await message.reply({ content: `💤 ${u.username} غايب حاليًا: ${a.reason}`, allowedMentions: { repliedUser: false } }).catch(() => undefined);
      break; // one notice is enough
    }
  }
}

/** Counting game. Returns true if the message was a counting attempt (handled). */
export async function handleCounting(message: Message): Promise<boolean> {
  const guildId = message.guild!.id;
  const cc = await getCounting(guildId);
  if (!cc.enabled || !cc.channelId || message.channelId !== cc.channelId) return false;
  const text = (message.content ?? '').trim();
  if (!/^\d+$/.test(text)) return false; // not a number — leave to normal processing
  const num = Number(text);
  const channel = message.channel as TextChannel;
  if (num === cc.current + 1 && message.author.id !== cc.lastUserId) {
    await updateCounting(guildId, { current: num, lastUserId: message.author.id, best: Math.max(cc.best, num) });
    await message.react('✅').catch(() => undefined);
  } else {
    await updateCounting(guildId, { current: 0, lastUserId: null });
    await message.react('❌').catch(() => undefined);
    await channel.send(`💥 ${message.author} كسر التسلسل عند **${cc.current}**! نبدأ من جديد من 1.`).catch(() => undefined);
  }
  return true;
}

/** DM members whose highlight words appear in the message. */
export async function handleHighlights(message: Message): Promise<void> {
  const highlights = await getHighlights(message.guild!.id);
  if (!highlights.length) return;
  const lower = (message.content ?? '').toLowerCase();
  if (!lower) return;
  const notified = new Set<string>();
  for (const h of highlights) {
    if (h.userId === message.author.id || notified.has(h.userId)) continue;
    if (!lower.includes(h.word)) continue;
    notified.add(h.userId);
    const member = message.guild!.members.cache.get(h.userId);
    const embed = new EmbedBuilder()
      .setColor(0xf57c00)
      .setTitle('🔔 تنبيه كلمة')
      .setURL(message.url)
      .setDescription(`ذُكرت كلمتك **${h.word}** في <#${message.channelId}>:\n>>> ${(message.content ?? '').slice(0, 300)}`)
      .setTimestamp();
    await member?.user.send({ embeds: [embed] }).catch(() => undefined);
  }
}

// Debounced sticky repost so we don't delete+resend on every single message.
const stickyTimers = new Map<string, NodeJS.Timeout>();
export async function maybeSticky(message: Message): Promise<void> {
  const guildId = message.guild!.id;
  const channels = await getStickyChannels(guildId);
  if (!channels.has(message.channelId)) return;
  const key = `${guildId}:${message.channelId}`;
  const existing = stickyTimers.get(key);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    stickyTimers.delete(key);
    repostSticky(message.client, prisma, guildId, message.channelId).catch(() => undefined);
  }, 4000);
  t.unref?.();
  stickyTimers.set(key, t);
}
