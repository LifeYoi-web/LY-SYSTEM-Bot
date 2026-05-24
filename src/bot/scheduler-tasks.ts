import { ChannelType, type Client, type TextChannel } from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import { endGiveaway } from './giveaways';
import { getBirthdayConfig } from '../db/community';

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
