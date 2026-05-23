import 'dotenv/config';
import { logger } from './shared/logger';
import { client } from './bot/client';
import { loadCommands, registerCommands, loadEvents } from './bot/loader';

async function main() {
  const token = process.env.DISCORD_TOKEN!;
  const clientId = process.env.CLIENT_ID!;

  const commands = loadCommands();
  await registerCommands(commands, token, clientId);
  loadEvents(client, commands);

  await client.login(token);
}

main().catch((err) => {
  logger.error(`Fatal: ${err}`);
  process.exit(1);
});
