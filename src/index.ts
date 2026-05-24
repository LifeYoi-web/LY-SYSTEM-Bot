import 'dotenv/config';
import { loadConfig } from './shared/config';
import { logger } from './shared/logger';
import { client } from './bot/client';
import { loadCommands, registerCommands, loadEvents } from './bot/loader';
import { prisma } from './db/prisma';
import { ensureGuildSettings } from './db/settingsCache';
import { startApiServer } from './api/server';
import { startScheduler } from './bot/scheduler';

async function main() {
  const config = loadConfig();

  const commands = loadCommands();
  await registerCommands(commands, config.discordToken, config.clientId, config.guildId);
  loadEvents(client, commands);

  await client.login(config.discordToken);
  await ensureGuildSettings(config.guildId);

  startApiServer({ client, prisma, config });
  startScheduler({ client, prisma, guildId: config.guildId });
}

main().catch((err) => {
  logger.error(`Fatal: ${err}`);
  process.exit(1);
});
