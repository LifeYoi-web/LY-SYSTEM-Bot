import { Client } from 'discord.js';
import { logger } from '../../shared/logger';
import { getSettings } from '../../db/settingsCache';
import { buildPresence } from '../presence';
import { prisma } from '../../db/prisma';
import { reconcileTempVoice } from '../tempvoice';
import { getMusicManager } from '../music/manager';

module.exports = {
  name: 'ready',
  once: true,
  async execute(client: Client) {
    logger.success(`Bot is online as: ${client.user?.tag}`);
    logger.info(`Connected to ${client.guilds.cache.size} server(s)`);

    const guildId = process.env.GUILD_ID;
    const totalMembers = client.guilds.cache.reduce((sum, g) => sum + (g.memberCount ?? 0), 0);
    // Apply the dashboard-configured presence (falls back to the default Watching status).
    const settings = guildId ? await getSettings(guildId).catch(() => null) : null;
    client.user?.setPresence(buildPresence(settings ?? {}, totalMembers));

    // Warm the member cache so the dashboard's member list + analytics are complete.
    if (guildId) {
      const guild = client.guilds.cache.get(guildId);
      await guild?.members
        .fetch()
        .then((m) => logger.success(`Member cache warmed (${m.size})`))
        .catch(() => logger.warning('Could not warm member cache (check GuildMembers intent)'));
    }

    // Prune orphaned temp voice rooms (created last session, never cleaned because the bot
    // restarted before the channels emptied).
    await reconcileTempVoice(client, prisma).catch((err) => logger.warning(`tempvoice reconcile failed: ${err}`));

    // Connect to the Lavalink node (no-op if music is disabled). Never blocks/aborts startup.
    const music = getMusicManager();
    if (music && client.user) {
      await music
        .init({ id: client.user.id, username: client.user.username })
        .then(() => logger.success('Music: Lavalink init sent.'))
        .catch((err) => logger.warning(`Music: Lavalink init failed (continuing): ${err}`));
    }
  },
};
