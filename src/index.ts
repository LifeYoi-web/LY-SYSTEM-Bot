import 'dotenv/config';
import { loadConfig } from './shared/config';
import { logger } from './shared/logger';
import { client, attachClientErrorHandlers } from './bot/client';
import { loadCommands, registerCommands, loadEvents } from './bot/loader';
import { prisma } from './db/prisma';
import { ensureGuildSettings } from './db/settingsCache';
import { seedOwnerPlan } from './db/subscriptions';
import { startApiServer } from './api/server';
import { startScheduler } from './bot/scheduler';
import { initMusicManager } from './bot/music/manager';
import { boot } from './boot';
import { allowStatsGuild } from './bot/stats';

async function main() {
  const config = loadConfig();
  allowStatsGuild(config.guildId); // fleet-safety: only the tenant guild is counted

  const commands = loadCommands();
  loadEvents(client, commands);
  attachClientErrorHandlers(client, 'bot');

  // Build the music manager (gated: no-op without LAVALINK_*). Must exist before `ready` fires.
  initMusicManager(client, config);

  await boot({
    guildId: config.guildId,
    login: () => client.login(config.discordToken),
    ensureGuildSettings: async (gid: string) => {
      await ensureGuildSettings(gid);
      await seedOwnerPlan(gid); // owner guild = lifetime custom (created once, never overwritten)
    },
    startApiServer: () => startApiServer({ client, prisma, config }),
    startScheduler: () =>
      startScheduler({
        client,
        prisma,
        rapidApiKey: config.rapidApiKey,
        rapidApiTikTokHost: config.rapidApiTikTokHost,
      }),
    // Multi-guild: global registration; clears the stale guild-scoped set from the single-guild era.
    registerCommands: () => registerCommands(commands, config.discordToken, config.clientId, undefined, { clearGuildId: config.guildId }),
    logError: (msg) => logger.error(msg),
    logInfo: (msg) => logger.info(msg),
  });
}

main().catch((err) => {
  logger.error(`Fatal: ${err}`);
  process.exit(1);
});
