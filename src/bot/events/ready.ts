import { Client } from 'discord.js';
import { logger } from '../../shared/logger';
import { getSettings } from '../../db/settingsCache';
import { buildPresence } from '../presence';
import { prisma } from '../../db/prisma';
import { reconcileTempVoice } from '../tempvoice';
import { getMusicManager } from '../music/manager';
import { cacheGuildInvites } from '../invites';
import { reconcileBoosters } from '../boosters';
import { reconcileKnownGuilds } from '../guilds';

module.exports = {
  name: 'ready',
  once: true,
  async execute(client: Client) {
    logger.success(`Bot is online as: ${client.user?.tag}`);
    logger.info(`Connected to ${client.guilds.cache.size} server(s)`);

    const ownerGuildId = process.env.GUILD_ID;
    const totalMembers = client.guilds.cache.reduce((sum, g) => sum + (g.memberCount ?? 0), 0);
    // Presence comes from the owner guild's settings (the bot has ONE global presence).
    const settings = ownerGuildId ? await getSettings(ownerGuildId).catch(() => null) : null;
    client.user?.setPresence(buildPresence(settings ?? {}, totalMembers));

    // Registry sync for every guild we are in (settings + subscription + stats).
    const n = await reconcileKnownGuilds(client).catch(() => 0);
    if (n) logger.success(`Reconciled ${n}/${client.guilds.cache.size} guild(s) into the registry`);

    // Owner guild keeps the eager member-cache warm (dashboard member list);
    // other guilds warm lazily on demand.
    if (ownerGuildId) {
      const ownerGuild = client.guilds.cache.get(ownerGuildId);
      await ownerGuild?.members
        .fetch()
        .then((m) => logger.success(`Member cache warmed (${m.size})`))
        .catch(() => logger.warning('Could not warm member cache (check GuildMembers intent)'));
    }

    // Per-guild cache warms + reconciles (invite attribution, boosters, temp-voice orphans).
    for (const guild of client.guilds.cache.values()) {
      await cacheGuildInvites(guild).catch(() => undefined);
      await reconcileBoosters(guild, prisma).catch(() => undefined);
      await reconcileTempVoice(client, prisma, guild.id).catch((err) =>
        logger.warning(`tempvoice reconcile failed for ${guild.id}: ${err}`),
      );
    }

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
