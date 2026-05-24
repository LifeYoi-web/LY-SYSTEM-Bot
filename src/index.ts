import 'dotenv/config';
import { loadConfig } from './shared/config';
import { logger } from './shared/logger';
import { client } from './bot/client';
import { loadCommands, registerCommands, loadEvents } from './bot/loader';
import { prisma } from './db/prisma';
import { ensureGuildSettings } from './db/settingsCache';
import { startApiServer } from './api/server';

async function main() {
  const config = loadConfig();

  const commands = loadCommands();
  await registerCommands(commands, config.discordToken, config.clientId);
  loadEvents(client, commands);

  await client.login(config.discordToken);
  await ensureGuildSettings(config.guildId);

  startApiServer({ client, prisma, config });
}

main().catch((err) => {
  logger.error(`Fatal: ${err}`);
  process.exit(1);
});
