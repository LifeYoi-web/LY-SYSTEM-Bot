import 'dotenv/config';
import { loadConfig } from './shared/config';
import { logger } from './shared/logger';
import { client } from './bot/client';
import { loadCommands, registerCommands, loadEvents } from './bot/loader';
import { prisma } from './db/prisma';
import { ensureGuildSettings } from './db/settingsCache';
import { startApiServer } from './api/server';
import { startScheduler } from './bot/scheduler';
import { initMusicManager } from './bot/music/manager';
import { boot } from './boot';

async function main() {
  const config = loadConfig();

  const commands = loadCommands();
  loadEvents(client, commands);

  // Build the music manager (gated: no-op without LAVALINK_*). Must exist before `ready` fires.
  initMusicManager(client, config);

  await boot({
    guildId: config.guildId,
    login: () => client.login(config.discordToken),
    ensureGuildSettings,
    startApiServer: () => startApiServer({ client, prisma, config }),
    startScheduler: () =>
      startScheduler({
        client,
        prisma,
        guildId: config.guildId,
        rapidApiKey: config.rapidApiKey,
        rapidApiTikTokHost: config.rapidApiTikTokHost,
      }),
    registerCommands: () => registerCommands(commands, config.discordToken, config.clientId, config.guildId),
    logError: (msg) => logger.error(msg),
  });
}

main().catch((err) => {
  logger.error(`Fatal: ${err}`);
  process.exit(1);
});
