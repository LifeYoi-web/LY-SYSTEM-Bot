import { Message, PermissionFlagsBits, EmbedBuilder, type TextChannel } from 'discord.js';
import { prisma } from '../../db/prisma';
import { getAutoMod } from '../../db/automod';
import { getAutoResponses, matchAutoResponse } from '../../db/autoresponses';
import { getLevelConfig } from '../../db/leveling';
import { getEconomyConfig } from '../../db/community';
import { checkContent, checkScamLink, checkSpam, VIOLATION_LABELS } from '../automod/checker';
import { awardMessageXp } from '../leveling';
import { awardMessageCoins } from '../economy';
import { bump } from '../stats';
import { logEvent } from '../logging';
import { handleAfk, handleCounting, handleHighlights, maybeSticky } from '../community-handlers';
import { banUser, kickUser, muteUser, warnUser, type ActionDeps, type GuildLike } from '../moderation/actions';

module.exports = {
  name: 'messageCreate',
  once: false,
  async execute(message: Message) {
    if (!message.guild || message.author.bot) return;
    const guildId = message.guild.id;
    bump(guildId, 'messages');

    // 1) AutoMod — may delete the message and act, then stop processing it.
    const cfg = await getAutoMod(guildId).catch(() => null);
    if (cfg?.enabled && !cfg.ignoredChannelIds.includes(message.channelId)) {
      const member = message.member;
      const bypass =
        member?.permissions.has(PermissionFlagsBits.ManageMessages) ||
        (member != null && cfg.ignoredRoleIds.some((id) => member.roles.cache.has(id)));
      if (!bypass) {
        const mentions = message.mentions.users.size;
        let violation = checkContent(message.content ?? '', mentions, cfg);
        let action = cfg.actionOnViolation;
        // Scam/phishing links have their own action so a guild can allow normal links
        // while still nuking known token-stealing domains.
        if (!violation && cfg.antiScam && checkScamLink(message.content ?? '', cfg.scamDomains)) {
          violation = 'scam';
          action = cfg.scamAction;
        }
        if (!violation && cfg.antiSpam && checkSpam(message.author.id)) violation = 'spam';
        if (violation) {
          await message.delete().catch(() => undefined);
          const deps: ActionDeps = { guild: message.guild as unknown as GuildLike, prisma };
          const params = {
            guildId,
            targetUserId: message.author.id,
            moderatorId: message.client.user?.id ?? 'automod',
            reason: `AutoMod: ${VIOLATION_LABELS[violation]}`,
          };
          try {
            if (action === 'warn') await warnUser(deps, params);
            else if (action === 'mute') await muteUser(deps, { ...params, seconds: cfg.muteSeconds });
            else if (action === 'kick') await kickUser(deps, params);
            else if (action === 'ban') await banUser(deps, params);
          } catch {
            /* message already removed; action failures are non-fatal */
          }
          bump(guildId, 'modActions');
          const embed = new EmbedBuilder()
            .setColor(0xe5484d)
            .setTitle('🛡️ AutoMod')
            .addFields(
              { name: 'العضو', value: `<@${message.author.id}>`, inline: true },
              { name: 'المخالفة', value: VIOLATION_LABELS[violation], inline: true },
              { name: 'الإجراء', value: action, inline: true },
            )
            .setTimestamp();
          await logEvent({ client: message.client, prisma }, guildId, `automod_${violation}`, {
            userId: message.author.id,
            channelId: message.channelId,
            action: cfg.actionOnViolation,
          }, embed);
          return;
        }
      }
    }

    // 2) Community handlers (AFK, counting, highlights, sticky) — each is independently guarded.
    await handleAfk(message).catch(() => undefined);
    if (await handleCounting(message).catch(() => false)) return; // counting messages are self-contained
    await handleHighlights(message).catch(() => undefined);
    await maybeSticky(message).catch(() => undefined);

    // 3) Auto-responder
    try {
      const responses = await getAutoResponses(guildId);
      if (responses.length) {
        const match = matchAutoResponse(message.content ?? '', responses);
        if (match) await message.reply({ content: match.reply }).catch(() => undefined);
      }
    } catch {
      /* non-fatal */
    }

    // 3) Leveling XP
    try {
      const lvl = await getLevelConfig(guildId);
      if (lvl.enabled && message.member) {
        const r = await awardMessageXp(prisma, guildId, message.author.id, message.member, lvl);
        if (r.leveledUp && lvl.levelUpEnabled) {
          const text = (lvl.levelUpMessage || '🎉 مبروك {user}! وصلت المستوى {level}.')
            .split('{user}').join(`<@${message.author.id}>`)
            .split('{level}').join(String(r.level));
          const target = lvl.levelUpChannelId
            ? (message.guild.channels.cache.get(lvl.levelUpChannelId) as TextChannel | undefined)
            : (message.channel as TextChannel);
          await target?.send?.({ content: text, allowedMentions: { users: [message.author.id] } }).catch(() => undefined);
        }
      }
    } catch {
      /* non-fatal */
    }

    // 4) Economy currency (earn-per-message, own cooldown)
    try {
      const eco = await getEconomyConfig(guildId);
      if (eco.enabled) await awardMessageCoins(prisma, guildId, message.author.id, eco);
    } catch {
      /* non-fatal */
    }
  },
};
