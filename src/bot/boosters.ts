import { EmbedBuilder, type Guild, type GuildMember, type PartialGuildMember, type TextChannel } from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import { getBoosterConfig, getEconomyConfig } from '../db/community';
import { addCoins } from './economy';

const BOOST_PINK = 0xf47fff;

async function onBoostStart(guild: Guild, prisma: PrismaClient, member: GuildMember): Promise<void> {
  const cfg = await getBoosterConfig(guild.id).catch(() => null);
  if (!cfg?.enabled) return;
  for (const roleId of cfg.perkRoleIds) await member.roles.add(roleId, 'Server boost perk').catch(() => undefined);
  await prisma.boosterRecord
    .upsert({
      where: { guildId_userId: { guildId: guild.id, userId: member.id } },
      create: { guildId: guild.id, userId: member.id, active: true },
      update: { active: true, startedAt: new Date() },
    })
    .catch(() => undefined);

  if (cfg.coinBonus > 0) {
    const eco = await getEconomyConfig(guild.id).catch(() => null);
    if (eco?.enabled) await addCoins(prisma, guild.id, member.id, cfg.coinBonus, 'boost');
  }

  if (cfg.announceChannelId) {
    const channel = guild.channels.cache.get(cfg.announceChannelId) as TextChannel | undefined;
    const text = (cfg.message || '💜 شكرًا {user} على دعم {server} بالبوست! ({count} بوست الآن)')
      .split('{user}').join(`<@${member.id}>`)
      .split('{server}').join(guild.name)
      .split('{count}').join(String(guild.premiumSubscriptionCount ?? 0));
    const embed = new EmbedBuilder()
      .setColor(BOOST_PINK)
      .setTitle('💜 بوست جديد!')
      .setDescription(text)
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      .setTimestamp();
    await channel?.send?.({ content: `<@${member.id}>`, embeds: [embed], allowedMentions: { users: [member.id] } }).catch(() => undefined);
  }
}

async function onBoostStop(guild: Guild, prisma: PrismaClient, member: GuildMember): Promise<void> {
  const cfg = await getBoosterConfig(guild.id).catch(() => null);
  if (!cfg?.enabled) return;
  for (const roleId of cfg.perkRoleIds) await member.roles.remove(roleId, 'Server boost ended').catch(() => undefined);
  await prisma.boosterRecord
    .update({ where: { guildId_userId: { guildId: guild.id, userId: member.id } }, data: { active: false } })
    .catch(() => undefined);
}

/** Diff premiumSince across a guildMemberUpdate and fire the start/stop perk flow. */
export async function handleBoostChange(
  prisma: PrismaClient,
  oldMember: GuildMember | PartialGuildMember,
  newMember: GuildMember,
): Promise<void> {
  const was = Boolean(oldMember.premiumSince);
  const now = Boolean(newMember.premiumSince);
  if (was === now) return;
  if (now) await onBoostStart(newMember.guild, prisma, newMember);
  else await onBoostStop(newMember.guild, prisma, newMember);
}

/** On ready, sync records with the live boost state for cached members (best-effort). */
export async function reconcileBoosters(guild: Guild, prisma: PrismaClient): Promise<void> {
  const cfg = await getBoosterConfig(guild.id).catch(() => null);
  if (!cfg?.enabled) return;
  for (const member of guild.members.cache.values()) {
    if (member.user.bot) continue;
    if (member.premiumSince) {
      await prisma.boosterRecord
        .upsert({
          where: { guildId_userId: { guildId: guild.id, userId: member.id } },
          create: { guildId: guild.id, userId: member.id, active: true },
          update: { active: true },
        })
        .catch(() => undefined);
    }
  }
}
