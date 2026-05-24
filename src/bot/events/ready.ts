import { Client, ActivityType } from 'discord.js';
import { logger } from '../../shared/logger';

module.exports = {
  name: 'ready',
  once: true,
  async execute(client: Client) {
    logger.success(`Bot is online as: ${client.user?.tag}`);
    logger.info(`Connected to ${client.guilds.cache.size} server(s)`);

    const totalMembers = client.guilds.cache.reduce((sum, g) => sum + (g.memberCount ?? 0), 0);
    client.user?.setPresence({
      status: 'online',
      activities: [{ name: `${totalMembers} عضو • /help`, type: ActivityType.Watching }],
    });

    // Warm the member cache so the dashboard's member list + analytics are complete.
    const guildId = process.env.GUILD_ID;
    if (guildId) {
      const guild = client.guilds.cache.get(guildId);
      await guild?.members
        .fetch()
        .then((m) => logger.success(`Member cache warmed (${m.size})`))
        .catch(() => logger.warning('Could not warm member cache (check GuildMembers intent)'));
    }
  },
};
