import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { logger } from '../shared/logger';

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessageReactions, // starboard
    GatewayIntentBits.GuildVoiceStates, // temp voice rooms (join-to-create)
  ],
  // Partials let us receive reaction/message events on objects that aren't cached
  // (e.g. starboard reactions on older messages).
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

/**
 * Per-client fault isolation (SaaS Phase 0, spec §6.2): an unhandled 'error'
 * event on an EventEmitter throws — one client's gateway hiccup must never take
 * down the shared fleet process. Phase 1 calls this once per tenant client.
 */
export function attachClientErrorHandlers(
  emitter: { on(event: string, listener: (arg: unknown) => void): unknown },
  label: string,
  logError: (msg: string) => void = logger.error,
): void {
  emitter.on('error', (err) => logError(`${label}: client error: ${err}`));
  emitter.on('shardError', (err) => logError(`${label}: shard error: ${err}`));
}
