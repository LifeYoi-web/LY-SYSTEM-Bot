import { Client, Collection, REST, Routes } from 'discord.js';
import { readdirSync } from 'fs';
import { join } from 'path';
import { logger } from '../shared/logger';

export interface Command {
  data: { name: string; toJSON: () => object };
  execute: (interaction: any) => Promise<void>;
}

export function loadCommands(): Collection<string, Command> {
  const commands = new Collection<string, Command>();
  const commandsPath = join(__dirname, 'commands');
  for (const folder of readdirSync(commandsPath)) {
    const folderPath = join(commandsPath, folder);
    for (const file of readdirSync(folderPath).filter((f) => f.endsWith('.js'))) {
      const command: Command = require(join(folderPath, file));
      commands.set(command.data.name, command);
      logger.success(`Command loaded: ${command.data.name}`);
    }
  }
  return commands;
}

export async function registerCommands(
  commands: Collection<string, Command>,
  token: string,
  clientId: string,
  guildId?: string,
  opts?: { clearGuildId?: string },
): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(token);
  const body = Array.from(commands.values()).map((c) => c.data.toJSON());
  logger.info('Registering commands with Discord...');
  if (guildId) {
    // Guild-scoped registration updates INSTANTLY (kept for tests/tooling).
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
    // Clear any stale GLOBAL commands left by earlier deploys so they don't show as duplicates.
    await rest.put(Routes.applicationCommands(clientId), { body: [] }).catch(() => undefined);
    logger.success(`Registered ${body.length} command(s) to guild ${guildId} (instant).`);
  } else {
    // Multi-guild: ONE global set serves every guild the shared bot is in.
    await rest.put(Routes.applicationCommands(clientId), { body });
    if (opts?.clearGuildId) {
      // Clear the stale guild-scoped set from the single-guild era so commands don't show twice.
      await rest.put(Routes.applicationGuildCommands(clientId, opts.clearGuildId), { body: [] }).catch(() => undefined);
    }
    logger.success(`Registered ${body.length} global command(s).`);
  }
}

export function loadEvents(client: Client, commands: Collection<string, Command>): void {
  const eventsPath = join(__dirname, 'events');
  for (const file of readdirSync(eventsPath).filter((f) => f.endsWith('.js'))) {
    const event = require(join(eventsPath, file));
    const handler = (...args: any[]) => event.execute(...args, commands);
    if (event.once) client.once(event.name, handler);
    else client.on(event.name, handler);
    logger.success(`Event loaded: ${event.name}`);
  }
}
