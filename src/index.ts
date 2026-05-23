import 'dotenv/config';
import { Client, GatewayIntentBits, Collection, REST, Routes } from 'discord.js';
import { readdirSync } from 'fs';
import { join } from 'path';
import { logger } from './utils/logger';

interface Command {
  data: { name: string; toJSON: () => object };
  execute: (interaction: any) => Promise<void>;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const commands = new Collection<string, Command>();

async function loadCommands() {
  const commandsPath = join(__dirname, 'commands');
  const commandFolders = readdirSync(commandsPath);

  for (const folder of commandFolders) {
    const folderPath = join(commandsPath, folder);
    const commandFiles = readdirSync(folderPath).filter(f => f.endsWith('.js'));

    for (const file of commandFiles) {
      const command: Command = require(join(folderPath, file));
      commands.set(command.data.name, command);
      logger.success(`Command loaded: ${command.data.name}`);
    }
  }
}

async function registerCommands() {
  const token = process.env.DISCORD_TOKEN!;
  const clientId = process.env.CLIENT_ID!;

  const rest = new REST({ version: '10' }).setToken(token);
  const commandData = Array.from(commands.values()).map(cmd => cmd.data.toJSON());

  logger.info('Registering commands with Discord...');
  await rest.put(Routes.applicationCommands(clientId), { body: commandData });
  logger.success('All commands registered successfully!');
}

function loadEvents() {
  const eventsPath = join(__dirname, 'events');
  const eventFiles = readdirSync(eventsPath).filter(f => f.endsWith('.js'));

  for (const file of eventFiles) {
    const event = require(join(eventsPath, file));
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, commands));
    } else {
      client.on(event.name, (...args) => event.execute(...args, commands));
    }
    logger.success(`Event loaded: ${event.name}`);
  }
}

async function main() {
  await loadCommands();
  await registerCommands();
  loadEvents();
  await client.login(process.env.DISCORD_TOKEN);
}

main().catch(console.error);
