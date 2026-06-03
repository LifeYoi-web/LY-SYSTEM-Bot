import { ChannelType, EmbedBuilder, type Client, type TextChannel } from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import { endGiveaway } from './giveaways';
import {
  getBirthdayConfig,
  getDigestConfig,
  updateDigestConfig,
  getAlertConfig,
  updateAlertConfig,
} from '../db/community';
import { getSettings } from '../db/settingsCache';
import { detectAlerts } from '../shared/alerts';
import { expireDueRoles } from './shop';
import { sweepRaidLocks } from './raid';

const ORANGE = 0xf57c00;

export interface TaskDeps {
  client: Client;
  prisma: PrismaClient;
  guildId: string;
}

export async function endDueGiveaways(deps: TaskDeps, now: Date = new Date()): Promise<number> {
  const due = await deps.prisma.giveaway.findMany({ where: { guildId: deps.guildId, ended: false, endsAt: { lte: now } } });
  for (const g of due) await endGiveaway(deps.client, deps.prisma, g).catch(() => undefined);
  return due.length;
}

export async function fireDueReminders(deps: TaskDeps, now: Date = new Date()): Promise<number> {
  const due = await deps.prisma.reminder.findMany({ where: { guildId: deps.guildId, remindAt: { lte: now } }, take: 50 });
  for (const r of due) {
    const channel = deps.client.channels.cache.get(r.channelId) as TextChannel | undefined;
    if (channel?.isTextBased?.()) {
      await channel.send({ content: `⏰ <@${r.userId}> تذكير: ${r.content}`, allowedMentions: { users: [r.userId] } }).catch(() => undefined);
    } else {
      const user = await deps.client.users.fetch(r.userId).catch(() => null);
      await user?.send(`⏰ تذكير: ${r.content}`).catch(() => undefined);
    }
    await deps.prisma.reminder.delete({ where: { id: r.id } }).catch(() => undefined);
  }
  return due.length;
}

const BDAY_LABEL = '🎂';
export async function announceBirthdays(deps: TaskDeps, now: Date = new Date()): Promise<number> {
  const cfg = await getBirthdayConfig(deps.guildId);
  if (!cfg.enabled) return 0;
  const day = now.getUTCDate();
  const month = now.getUTCMonth() + 1;
  const bdays = await deps.prisma.birthday.findMany({ where: { guildId: deps.guildId, day, month } });
  const guild = deps.client.guilds.cache.get(deps.guildId);

  // Reconcile the birthday role: only today's birthday members should hold it.
  if (cfg.roleId && guild) {
    const role = guild.roles.cache.get(cfg.roleId);
    const today = new Set(bdays.map((b) => b.userId));
    if (role) {
      for (const m of role.members.values()) if (!today.has(m.id)) await m.roles.remove(cfg.roleId).catch(() => undefined);
    }
  }

  if (bdays.length && cfg.channelId) {
    const channel = deps.client.channels.cache.get(cfg.channelId) as TextChannel | undefined;
    for (const b of bdays) {
      if (channel?.isTextBased?.()) {
        await channel
          .send({ content: `${BDAY_LABEL} كل عام و<@${b.userId}> بخير! عيد ميلاد سعيد 🎉`, allowedMentions: { users: [b.userId] } })
          .catch(() => undefined);
      }
      if (cfg.roleId && guild) {
        const m = await guild.members.fetch(b.userId).catch(() => null);
        await m?.roles.add(cfg.roleId).catch(() => undefined);
      }
    }
  }
  return bdays.length;
}

const TYPE_LABEL: Record<string, string> = {
  members: 'الأعضاء',
  humans: 'الأعضاء',
  bots: 'البوتات',
  roles: 'الرتب',
  channels: 'القنوات',
  boosts: 'البوستات',
};

export async function refreshStatCounters(deps: TaskDeps): Promise<number> {
  const counters = await deps.prisma.statCounter.findMany({ where: { guildId: deps.guildId } });
  if (!counters.length) return 0;
  const guild = deps.client.guilds.cache.get(deps.guildId);
  if (!guild) return 0;
  const bots = [...guild.members.cache.values()].filter((m) => m.user.bot).length;
  const counts: Record<string, number> = {
    members: guild.memberCount,
    bots,
    humans: Math.max(guild.memberCount - bots, 0),
    roles: Math.max(guild.roles.cache.size - 1, 0), // exclude @everyone
    channels: [...guild.channels.cache.values()].filter((c) => c.type !== ChannelType.GuildCategory && !c.isThread()).length,
    boosts: guild.premiumSubscriptionCount ?? 0,
  };
  let updated = 0;
  for (const c of counters) {
    const channel = guild.channels.cache.get(c.channelId) as { name: string; setName: (n: string) => Promise<unknown> } | undefined;
    if (!channel) continue;
    const name = c.template
      .split('{count}').join(String(counts[c.type] ?? 0))
      .split('{name}').join(TYPE_LABEL[c.type] ?? c.type)
      .slice(0, 100);
    if (channel.name !== name) {
      await channel.setName(name).catch(() => undefined);
      updated++;
    }
  }
  return updated;
}

/** Remove expired temp-purchase roles (role shop rentals). */
export async function expireShopRoles(deps: TaskDeps): Promise<number> {
  const guild = deps.client.guilds.cache.get(deps.guildId);
  if (!guild) return 0;
  return expireDueRoles(guild, deps.prisma);
}

/** Auto-lift an expired anti-raid lockdown. */
export async function sweepRaids(deps: TaskDeps): Promise<void> {
  const guild = deps.client.guilds.cache.get(deps.guildId);
  if (guild) await sweepRaidLocks(guild);
}

/** Post the weekly digest embed once on the configured weekday. */
export async function postWeeklyDigest(deps: TaskDeps, now: Date = new Date(), force = false): Promise<boolean> {
  const cfg = await getDigestConfig(deps.guildId);
  if (!cfg.channelId) return false;
  const key = now.toISOString().slice(0, 10);
  if (!force) {
    if (!cfg.enabled) return false;
    if (now.getUTCDay() !== cfg.weekday) return false;
    if (cfg.lastSentKey === key) return false; // already posted today
  }

  const since = new Date(now);
  since.setUTCDate(since.getUTCDate() - 7);
  const sinceKey = since.toISOString().slice(0, 10);
  const stats = await deps.prisma.dailyStat.findMany({ where: { guildId: deps.guildId, date: { gte: sinceKey } } });
  const sum = (k: 'messages' | 'joins' | 'leaves') => stats.reduce((s, d) => s + d[k], 0);
  const net = sum('joins') - sum('leaves');
  const [modActions, ticketsClosed, climbers] = await Promise.all([
    deps.prisma.moderationCase.count({ where: { guildId: deps.guildId, createdAt: { gte: since } } }),
    deps.prisma.ticket.count({ where: { guildId: deps.guildId, status: 'closed', closedAt: { gte: since } } }),
    deps.prisma.memberLevel.findMany({ where: { guildId: deps.guildId }, orderBy: { xp: 'desc' }, take: 5 }),
  ]);

  const channel = deps.client.channels.cache.get(cfg.channelId) as TextChannel | undefined;
  if (!channel?.isTextBased?.()) return false;
  const embed = new EmbedBuilder()
    .setColor(ORANGE)
    .setTitle('📊 ملخّص الأسبوع')
    .setDescription('أبرز ما جرى في السيرفر خلال آخر ٧ أيام:')
    .addFields(
      { name: '💬 الرسائل', value: sum('messages').toLocaleString('en-US'), inline: true },
      { name: '📈 صافي الأعضاء', value: `${net >= 0 ? '+' : ''}${net}`, inline: true },
      { name: '🛡️ إجراءات الإشراف', value: String(modActions), inline: true },
      { name: '🎫 تذاكر مغلقة', value: String(ticketsClosed), inline: true },
      {
        name: '🏆 أبرز المتسلّقين',
        value: climbers.map((r, i) => `${i + 1}. <@${r.userId}> — المستوى ${r.level}`).join('\n') || '—',
      },
    )
    .setTimestamp();
  await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => undefined);
  if (!force) await updateDigestConfig(deps.guildId, { lastSentKey: key });
  return true;
}

/** Evaluate churn/activity alert rules and post (at most one batch per UTC day). */
export async function runChurnAlerts(deps: TaskDeps, now: Date = new Date()): Promise<number> {
  const cfg = await getAlertConfig(deps.guildId);
  if (!cfg.enabled) return 0;
  const todayKey = now.toISOString().slice(0, 10);
  if (cfg.lastAlertKey === todayKey) return 0; // already alerted today

  const since = new Date(now);
  since.setUTCDate(since.getUTCDate() - 8);
  const sinceKey = since.toISOString().slice(0, 10);
  const stats = await deps.prisma.dailyStat.findMany({
    where: { guildId: deps.guildId, date: { gte: sinceKey } },
    orderBy: { date: 'asc' },
  });
  const hits = detectAlerts(
    stats.map((s) => ({ date: s.date, messages: s.messages, joins: s.joins, leaves: s.leaves })),
    todayKey,
    cfg,
  );
  if (!hits.length) return 0;

  let channelId = cfg.alertChannelId;
  if (!channelId) channelId = (await getSettings(deps.guildId).catch(() => null))?.logChannelId ?? null;
  if (!channelId) return 0;
  const channel = deps.client.channels.cache.get(channelId) as TextChannel | undefined;
  if (!channel?.isTextBased?.()) return 0;

  const embed = new EmbedBuilder()
    .setColor(0xe5484d)
    .setTitle('🚨 تنبيه نشاط السيرفر')
    .setDescription(hits.map((h) => h.message).join('\n'))
    .setTimestamp();
  await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => undefined);
  await updateAlertConfig(deps.guildId, { lastAlertKey: todayKey });
  return hits.length;
}
