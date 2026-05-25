import type { Client } from 'discord.js';
import { logger } from '../../shared/logger';
import type { CaseType, NotifyFn } from './actions';

const PHRASE: Record<CaseType, string> = {
  warn: '⚠️ تم توجيه تحذير لك في',
  mute: '🔇 تم كتمك في',
  kick: '👢 تم طردك من',
  ban: '⛔ تم حظرك من',
};

/** The DM body sent to the target of a moderation action. */
export function formatModDm(type: CaseType, reason: string | undefined, guildName: string): string {
  const r = reason && reason.trim() ? reason.trim() : 'غير محدّد';
  return `${PHRASE[type]} **${guildName}**\n**السبب:** ${r}`;
}

/**
 * Best-effort DM to the target user. NEVER throws — the user may have DMs closed
 * or no longer share a guild with the bot, and that must not fail the action.
 */
export function makeModNotifier(client: Client, guildName: string): NotifyFn {
  return async ({ userId, type, reason }) => {
    try {
      const user = await client.users.fetch(userId);
      await user.send(formatModDm(type, reason, guildName));
    } catch (err) {
      logger.info(`Could not DM ${userId} about ${type}: ${err}`);
    }
  };
}
