import { Client, GatewayIntentBits, Partials } from 'discord.js';

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessageReactions, // starboard
  ],
  // Partials let us receive reaction/message events on objects that aren't cached
  // (e.g. starboard reactions on older messages).
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});
