import { GuildVerificationLevel, type Guild, type GuildMember, type TextChannel } from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import { getRaidConfig } from '../db/community';
import { getSettings } from '../db/settingsCache';

// Sliding window of recent join timestamps per guild.
const joinTimes = new Map<string, number[]>();
// Active lockdown state per guild, so we can auto-lift and restore the prior verification level.
const lockState = new Map<string, { until: number; prevVerification: GuildVerificationLevel }>();

export function recordJoin(guildId: string, now: number, windowSec: number): number {
  const arr = (joinTimes.get(guildId) ?? []).filter((t) => now - t < windowSec * 1000);
  arr.push(now);
  joinTimes.set(guildId, arr);
  return arr.length;
}

async function alert(guild: Guild, channelId: string | null, text: string): Promise<void> {
  let id = channelId;
  if (!id) {
    const s = await getSettings(guild.id).catch(() => null);
    id = s?.logChannelId ?? null;
  }
  if (!id) return;
  const channel = guild.channels.cache.get(id) as TextChannel | undefined;
  await channel?.send?.({ content: text, allowedMentions: { parse: [] } }).catch(() => undefined);
}

async function engageLockdown(guild: Guild, cfg: { raiseVerification: boolean; autoLiftMinutes: number; alertChannelId: string | null }, now: number, note: string): Promise<void> {
  if (lockState.has(guild.id)) return;
  const prevVerification = guild.verificationLevel;
  const until = cfg.autoLiftMinutes > 0 ? now + cfg.autoLiftMinutes * 60_000 : Number.MAX_SAFE_INTEGER;
  lockState.set(guild.id, { until, prevVerification });
  if (cfg.raiseVerification) {
    await guild.setVerificationLevel(GuildVerificationLevel.VeryHigh, 'Anti-raid lockdown').catch(() => undefined);
  }
  await alert(guild, cfg.alertChannelId, note);
}

/** Called from guildMemberAdd. Returns true if the member was actioned by the raid gate. */
export async function handleRaidJoin(guild: Guild, prisma: PrismaClient, member: GuildMember, now: number = Date.now()): Promise<boolean> {
  const cfg = await getRaidConfig(guild.id).catch(() => null);
  if (!cfg?.enabled) return false;

  const locked = (lockState.get(guild.id)?.until ?? 0) > now;
  const count = recordJoin(guild.id, now, cfg.joinWindowSec);
  const trip = count >= cfg.joinThreshold;
  if (!locked && !trip) return false;

  if (trip && !locked) {
    await engageLockdown(
      guild,
      cfg,
      now,
      `🚨 **مكافحة الريد:** رُصدت موجة انضمام (${count} خلال ${cfg.joinWindowSec}ث) — تم تفعيل القفل التلقائي.`,
    );
  }

  if (cfg.action === 'kick') await member.kick('Anti-raid lockdown').catch(() => undefined);
  else if (cfg.action === 'ban') await member.ban({ reason: 'Anti-raid lockdown' }).catch(() => undefined);
  return true;
}

/** Scheduler sweep: auto-lift an expired lockdown and restore the previous verification level. */
export async function sweepRaidLocks(guild: Guild, now: number = Date.now()): Promise<boolean> {
  const st = lockState.get(guild.id);
  if (!st || st.until > now) return false;
  lockState.delete(guild.id);
  await guild.setVerificationLevel(st.prevVerification, 'Anti-raid lockdown auto-lifted').catch(() => undefined);
  await alert(guild, null, '✅ **مكافحة الريد:** انتهى القفل التلقائي وعاد مستوى التحقق لوضعه الطبيعي.');
  return true;
}

/** Manual /raidmode toggle. */
export async function setRaidMode(guild: Guild, on: boolean, now: number = Date.now()): Promise<void> {
  const cfg = await getRaidConfig(guild.id).catch(() => null);
  if (on) {
    await engageLockdown(
      guild,
      { raiseVerification: cfg?.raiseVerification ?? true, autoLiftMinutes: 0, alertChannelId: cfg?.alertChannelId ?? null },
      now,
      '🔒 **مكافحة الريد:** تم تفعيل القفل يدويًا بواسطة الإدارة.',
    );
  } else {
    const st = lockState.get(guild.id);
    lockState.delete(guild.id);
    if (st) await guild.setVerificationLevel(st.prevVerification, 'Raid mode disabled').catch(() => undefined);
    await alert(guild, cfg?.alertChannelId ?? null, '🔓 **مكافحة الريد:** تم إيقاف القفل يدويًا.');
  }
}

export function isLocked(guildId: string, now: number = Date.now()): boolean {
  return (lockState.get(guildId)?.until ?? 0) > now;
}

export function _resetRaidState(): void {
  joinTimes.clear();
  lockState.clear();
}
